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
});
