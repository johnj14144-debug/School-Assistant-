import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { _electron, type ElectronApplication, type Page } from 'playwright-core';
import { afterAll, describe, expect, it } from 'vitest';
import type { IpcChannel, IpcInput, IpcOutput } from '../src/shared/ipc';

const appDir = resolve(import.meta.dirname, '..');
// The electron package resolves to the path of its binary.
const electronPath = createRequire(import.meta.url)('electron') as string;
// A throwaway profile: data, logs and backups (see SCHOOL_ASSISTANT_DATA_DIR in src/main).
const dataDir = mkdtempSync(join(tmpdir(), 'sa-smoke-'));
const pageErrors: string[] = [];

async function launch(): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await _electron.launch({
    executablePath: electronPath,
    args: [appDir, ...(process.platform === 'linux' ? ['--no-sandbox'] : [])],
    env: { ...process.env, SCHOOL_ASSISTANT_DATA_DIR: dataDir },
  });
  const page = await app.firstWindow();
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  await page.getByTestId('timer-bar').waitFor();
  return { app, page };
}

/** Calls the IPC contract from the renderer, where the preload script exposes `window.api`. */
async function invoke<C extends IpcChannel>(page: Page, channel: C, input?: IpcInput<C>) {
  type LooseApi = { invoke(channel: string, input: unknown): Promise<unknown> };
  const result = await page.evaluate(
    (call) => (globalThis as unknown as { api: LooseApi }).api.invoke(call.channel, call.input),
    { channel: channel as string, input: input as unknown },
  );
  return result as IpcOutput<C>;
}

/** Polls `check` until it holds (waitForFunction treats an async predicate's promise as true). */
async function until(check: () => Promise<boolean>, what: string, timeoutMs = 10_000) {
  const end = Date.now() + timeoutMs;
  while (!(await check())) {
    if (Date.now() > end) throw new Error(`Timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

afterAll(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

describe('School Assistant (built app)', () => {
  it('launches, navigates, and runs a timer that survives a restart', async () => {
    let { app, page } = await launch();
    await page.getByText('No timer running').waitFor();

    // Navigate.
    await page.getByRole('link', { name: 'Tasks', exact: true }).click();
    await page.getByRole('heading', { name: 'Tasks' }).waitFor();
    await page.getByRole('link', { name: 'Grades', exact: true }).click();
    await page.getByRole('heading', { name: 'Grades' }).waitFor();
    await page.getByRole('link', { name: 'Today', exact: true }).click();
    await page.getByRole('heading', { name: 'Today’s list' }).waitFor();

    // Quick add from the command palette onto today's list.
    await page.keyboard.press('Control+k');
    const palette = page.getByLabel('Add a task, or search');
    await palette.fill('Smoke test task ~30m');
    await page.keyboard.press('Enter');
    await palette.waitFor({ state: 'detached' });
    await page.getByRole('link', { name: 'Smoke test task' }).first().waitFor();

    // Start the timer.
    await page.getByRole('button', { name: 'Start Smoke test task' }).click();
    const bar = page.getByTestId('timer-bar');
    await bar.getByTestId('timer-clock').waitFor();
    await bar.getByText('Smoke test task').waitFor();

    // Restart: the timer is still running.
    await app.close();
    ({ app, page } = await launch());
    const barAgain = page.getByTestId('timer-bar');
    await barAgain.getByTestId('timer-clock').waitFor();
    await barAgain.getByText('Smoke test task').waitFor();

    // Stop it: one finished session.
    await barAgain.getByRole('button', { name: 'Stop' }).click();
    await page.getByText('No timer running').waitFor();
    const [task] = (await invoke(page, 'today:get')).tasks;
    expect(task?.title).toBe('Smoke test task');
    const detail = await invoke(page, 'task:get', { id: task?.id ?? '' });
    expect(detail.sessions).toHaveLength(1);
    expect(detail.sessions[0]?.endAt).not.toBeNull();

    await app.close();
    expect(pageErrors).toEqual([]);
  });

  it('sets up a routine and plans a block that the Today page runs', async () => {
    const { app, page } = await launch();

    // A starter routine from the Routine page, then the calendar shows it.
    await page.getByRole('link', { name: 'Calendar', exact: true }).click();
    await page.getByRole('heading', { name: 'Calendar' }).waitFor();
    await page.getByRole('link', { name: 'Routine' }).click();
    await page.getByRole('button', { name: 'Add a starter routine' }).click();
    await page.getByText('Evening routine').waitFor();
    const routine = await invoke(page, 'fixed-event:list');
    expect(routine.find((e) => e.kind === 'sleep')).toMatchObject({
      startLocal: '23:00',
      endLocal: '06:30',
    });
    await page.getByRole('link', { name: 'Calendar' }).first().click();
    await page.locator('.sa-fixed-meal').first().waitFor();

    // A block for a task over the current time. The routine goes first, so the block can't
    // collide with it at whatever hour the test runs.
    for (const event of routine) await invoke(page, 'fixed-event:delete', { id: event.id });
    const task = await invoke(page, 'task:create', { title: 'Planned task' });
    const now = Date.now();
    const block = await invoke(page, 'block:create', {
      taskId: task.id,
      startAt: new Date(now - 10 * 60_000).toISOString(),
      endAt: new Date(now + 50 * 60_000).toISOString(),
    });
    expect(block.source).toBe('manual');

    // The Today page offers the planned task and starts it.
    await page.getByRole('link', { name: 'Today', exact: true }).click();
    const schedule = page.getByRole('region', { name: 'Schedule' });
    await schedule.getByText('Planned task').first().waitFor();
    await schedule.getByRole('button', { name: 'Start', exact: true }).click();
    await page.getByTestId('timer-bar').getByText('Planned task').waitFor();

    await app.close();
    expect(pageErrors).toEqual([]);
  });

  it('plans the week and says why each block is where it is', async () => {
    const { app, page } = await launch();
    const due = new Date(Date.now() + 3 * 86_400_000).toISOString();
    const essay = await invoke(page, 'task:create', {
      title: 'Essay draft',
      estimateMin: 120,
      dueAt: due,
    });
    // No due date typed: a soft deadline a week out; no estimate: the default hour.
    const unestimated = await invoke(page, 'task:create', { title: 'No estimate yet' });
    expect(unestimated.deadline).toBe('soft');

    await page.getByRole('link', { name: 'Calendar', exact: true }).click();
    await page.getByRole('button', { name: 'Plan my week' }).click();
    const panel = page.getByRole('region', { name: 'Plan' });
    // Earlier tests' tasks are planned too, so only the shape of the summary is fixed.
    await panel.getByText(/^Planned \d+ blocks?, .* of work, through/).waitFor();

    const now = Date.now();
    const range = await invoke(page, 'calendar:range', {
      from: new Date(now - 3_600_000).toISOString(),
      to: new Date(now + 8 * 86_400_000).toISOString(),
    });
    const planned = range.blocks.filter((b) => b.source === 'planner');
    expect(planned.every((b) => b.conflict === null)).toBe(true);
    const minutesFor = (taskId: string) =>
      planned
        .filter((b) => b.taskId === taskId)
        .reduce((sum, b) => sum + (Date.parse(b.endAt) - Date.parse(b.startAt)) / 60_000, 0);
    expect(minutesFor(essay.id)).toBe(120);
    expect(minutesFor(unestimated.id)).toBe(60);

    // The block dialog explains it (when the first block is in this week's view).
    const weekEnd = new Date();
    weekEnd.setHours(0, 0, 0, 0);
    weekEnd.setDate(weekEnd.getDate() - weekEnd.getDay() + 7);
    if (Date.parse(planned[0]?.startAt ?? '') < weekEnd.getTime()) {
      await page.locator('.sa-planner').first().click();
      await page.getByText('Why here').waitFor();
      await page.getByText(/(Due|Soft deadline) .*, with .* of free time to spare/).waitFor();
      await page.keyboard.press('Escape');
    }

    // Plan again: the planner's blocks are replaced, not added to.
    const firstRun = await invoke(page, 'planner:last-run');
    await page.getByRole('button', { name: 'Plan my week' }).click();
    await until(async () => {
      const run = await invoke(page, 'planner:last-run');
      return run !== null && run.at !== firstRun?.at;
    }, 'the second plan');
    const again = await invoke(page, 'calendar:range', {
      from: new Date(now - 3_600_000).toISOString(),
      to: new Date(now + 8 * 86_400_000).toISOString(),
    });
    const essayBlocks = (r: typeof range) =>
      r.blocks.filter((b) => b.source === 'planner' && b.taskId === essay.id);
    expect(essayBlocks(again)).toHaveLength(essayBlocks(range).length);

    await app.close();
    expect(pageErrors).toEqual([]);
  });

  it('follows the plan: finishing early, edits and "Re-plan now" (M6)', async () => {
    const { app, page } = await launch();
    const waitForTrigger = (trigger: string) =>
      until(
        async () => (await invoke(page, 'planner:last-run'))?.trigger === trigger,
        `a re-plan (${trigger})`,
      );
    const blocksNow = async () => {
      const now = Date.now();
      return (
        await invoke(page, 'calendar:range', {
          from: new Date(now - 3 * 3_600_000).toISOString(),
          to: new Date(now + 8 * 86_400_000).toISOString(),
        })
      ).blocks;
    };

    // "Planned task" has run since the routine test, inside its block: finishing it ends the
    // block now, and the rest of the day is re-packed.
    await page.getByRole('link', { name: 'Today', exact: true }).click();
    await page.getByTestId('timer-bar').getByRole('button', { name: 'Done' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Mark done' }).click();
    await waitForTrigger('finish');
    const finished = (await blocksNow()).find((b) => b.label === 'Planned task');
    expect(Date.parse(finished?.endAt ?? '')).toBeLessThanOrEqual(Date.now());

    // A new task is planned on its own, and the toast says so.
    const quiz = await invoke(page, 'task:create', {
      title: 'Quiz prep',
      estimateMin: 30,
      dueAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
    });
    await waitForTrigger('edit');
    expect((await blocksNow()).some((b) => b.taskId === quiz.id && b.source === 'planner')).toBe(
      true,
    );
    const toast = page.getByRole('status', { name: 'Plan changes' });
    await toast.getByText('Plan updated after a change').waitFor();
    await toast.getByText(/^Quiz prep: planned /).waitFor();
    await toast.getByRole('button', { name: 'Dismiss' }).click();

    // "Re-plan now" on the Calendar always answers.
    await page.getByRole('link', { name: 'Calendar', exact: true }).click();
    await page.getByRole('button', { name: 'Re-plan now' }).click();
    await toast.getByText(/^Re-planned/).waitFor();
    const planned = (await blocksNow()).filter((b) => b.source === 'planner');
    expect(planned.every((b) => b.conflict === null)).toBe(true);

    await app.close();
    expect(pageErrors).toEqual([]);
  });
});
