import { describe, expect, it } from 'vitest';
import { setupCalendar } from '../../test/calendar';

const SLEEP = {
  title: 'Sleep',
  kind: 'sleep',
  startDate: '2026-08-01',
  startLocal: '23:00',
  endLocal: '06:30',
  rrule: 'FREQ=DAILY',
};
const MATH = {
  title: 'MATH 2413',
  kind: 'class',
  startDate: '2026-08-24',
  startLocal: '10:00',
  endLocal: '10:50',
  rrule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR',
};
// Wed Oct 7, 2026, 8:00 AM in Houston (CDT, UTC−5).
const NOW = '2026-10-07T13:00:00.000Z';
const at = (hhmm: string, day = 7) => `2026-10-${String(day).padStart(2, '0')}T${hhmm}:00.000Z`;

function setup() {
  const env = setupCalendar(NOW);
  env.fixed(SLEEP);
  env.fixed(MATH);
  env.calendarChange.mockClear();
  return env;
}

const plannerBlocks = (env: ReturnType<typeof setup>) =>
  env.calendar.range(at('05:00'), at('05:00', 14)).blocks.filter((b) => b.source === 'planner');

describe('PlannerService', () => {
  it('plans open tasks around the routine and keeps a summary', () => {
    const env = setup();
    const hw = env.task('Calc HW 3', { estimateMin: 90, dueAt: at('04:59', 9) });
    // No estimate and no due date: planned for the default hour by its soft deadline.
    const calc = env.task('Buy a calculator');
    const run = env.planner.planWeek();
    expect(run).toMatchObject({
      at: NOW,
      from: NOW,
      until: '2026-10-14T05:00:00.000Z',
      blockCount: 2,
      plannedMin: 150,
      warnings: [],
    });
    const [first, second] = plannerBlocks(env);
    expect(second).toMatchObject({
      taskId: calc.id,
      startAt: at('15:50'),
      endAt: at('16:50'),
      reason: expect.stringContaining(
        "Soft deadline Wed, Oct 14, 11:59 PM, with 108h 30m of free time to spare. The earliest deadline among open work. No estimate yet, so it's planned for the default length.",
      ),
    });
    expect([first]).toEqual([
      expect.objectContaining({
        taskId: hw.id,
        startAt: at('13:00'),
        endAt: at('14:30'),
        source: 'planner',
        kind: 'work',
        locked: false,
        label: 'Calc HW 3',
        conflict: null,
        reason: expect.stringContaining('Due Thu, Oct 8, 11:59 PM'),
      }),
    ]);
    expect(env.planner.lastRun()).toEqual(run);
    expect(env.calendarChange).toHaveBeenCalledTimes(1);
  });

  it('replaces its own future blocks but keeps manual, locked and under-way ones', () => {
    const env = setup();
    const hw = env.task('Calc HW', { estimateMin: 240 });
    env.planner.planWeek();
    const first = plannerBlocks(env);
    expect(first.map((b) => [b.startAt, b.endAt])).toEqual([
      [at('13:00'), at('14:30')],
      [at('15:50'), at('17:20')],
      [at('17:30'), at('18:30')],
    ]);
    // Lock the second block, then move on 30 minutes into the first.
    env.updateBlock(first[1]?.id ?? '', { locked: true });
    const manual = env.block({ taskId: hw.id, startAt: at('19:00'), endAt: at('19:30') });
    env.clock.set(at('13:30'));
    env.timer.start(hw.id, at('13:00'));
    env.planner.planWeek();
    const blocks = env.calendar.range(at('05:00'), at('05:00', 14)).blocks;
    // 240 min − 30 logged − 60 left of the block under way − 90 locked − 30 manual = 30 to plan.
    expect(blocks.map((b) => [b.startAt, b.endAt, b.source, b.locked])).toEqual([
      [at('13:00'), at('14:30'), 'planner', false],
      [at('15:50'), at('17:20'), 'planner', true],
      [at('17:30'), at('18:00'), 'planner', false],
      [at('19:00'), at('19:30'), 'manual', false],
    ]);
    expect(blocks.some((b) => b.id === manual.id)).toBe(true);
  });

  it('turns a planner block moved by hand into a manual one', () => {
    const env = setup();
    env.task('Essay', { estimateMin: 60 });
    env.planner.planWeek();
    const [block] = plannerBlocks(env);
    const moved = env.updateBlock(block?.id ?? '', { startAt: at('18:00'), endAt: at('19:00') });
    expect(moved).toMatchObject({ source: 'manual', reason: '' });
    env.planner.planWeek();
    expect(plannerBlocks(env)).toEqual([]);
  });

  it('plans laundry as steps and waits that the calendar accepts', () => {
    const env = setup();
    const laundry = env.task('Laundry', {
      attention: 'background',
      steps: [
        { title: 'Load the washer', minutes: 5, wait: false },
        { title: 'washer', minutes: 45, wait: true },
        { title: 'Fold', minutes: 15, wait: false },
      ],
    });
    env.task('Study', { estimateMin: 600 });
    const run = env.planner.planWeek();
    expect(run.warnings).toEqual([]);
    const mine = plannerBlocks(env).filter((b) => b.taskId === laundry.id);
    expect(mine.map((b) => [b.kind, b.label])).toEqual([
      ['step', 'Laundry: Load the washer'],
      ['wait', 'Laundry: washer'],
      ['step', 'Laundry: Fold'],
    ]);
    // No conflicts anywhere: waits may overlap study blocks, steps never do.
    expect(plannerBlocks(env).every((b) => b.conflict === null)).toBe(true);
    expect(run.plannedMin).toBe(600 + 20);
  });

  it('warns about work that misses a hard due date and plans past it once the deadline is soft', () => {
    const env = setup();
    const report = env.task('Lab report', { estimateMin: 300, dueAt: at('15:00') });
    expect(report.deadline).toBe('hard');
    const run = env.planner.planWeek();
    expect(run.warnings).toEqual([
      expect.objectContaining({
        kind: 'short',
        taskId: report.id,
        minutes: 210,
        options: ['make-soft', 'edit-task'],
      }),
    ]);
    env.update(report.id, { deadline: 'soft' });
    const late = env.planner.planWeek();
    expect(late.warnings).toEqual([expect.objectContaining({ kind: 'late', taskId: report.id })]);
    expect(
      plannerBlocks(env).reduce(
        (sum, b) => sum + (Date.parse(b.endAt) - Date.parse(b.startAt)) / 60_000,
        0,
      ),
    ).toBe(300);
  });

  it('clears its future blocks', () => {
    const env = setup();
    env.task('Essay', { estimateMin: 200 });
    env.planner.planWeek();
    expect(env.planner.clear()).toEqual({ removed: 3 });
    expect(plannerBlocks(env)).toEqual([]);
    expect(env.planner.lastRun()).toBeNull();
  });

  it('reads and saves its preferences', () => {
    const env = setup();
    expect(env.planner.preferences()).toEqual({
      maxChunkMin: 90,
      breakMin: 10,
      defaultEstimateMin: 60,
    });
    expect(env.planner.setPreferences({ maxChunkMin: 60, defaultEstimateMin: 30 })).toEqual({
      maxChunkMin: 60,
      breakMin: 10,
      defaultEstimateMin: 30,
    });
    env.task('Essay', { estimateMin: 120, dueAt: at('04:59', 9) });
    env.task('Buy a calculator');
    env.planner.planWeek();
    // The 50 minutes before MATH are too short for the essay's second hour, not for 30 minutes.
    expect(plannerBlocks(env).map((b) => [b.label, b.startAt, b.endAt])).toEqual([
      ['Essay', at('13:00'), at('14:00')],
      ['Buy a calculator', at('14:10'), at('14:40')],
      ['Essay', at('15:50'), at('16:50')],
    ]);
  });
});

describe('PlannerService re-planning (M6)', () => {
  const view = (env: ReturnType<typeof setup>) =>
    plannerBlocks(env).map((b) => `${b.label} ${b.startAt.slice(11, 16)}–${b.endAt.slice(11, 16)}`);

  function planned() {
    const env = setup();
    const hw = env.task('Calc HW', { estimateMin: 90, dueAt: at('04:59', 9) });
    const reading = env.task('Chem reading', { estimateMin: 60, dueAt: at('04:59', 10) });
    const essay = env.task('Essay', { estimateMin: 120, dueAt: at('04:59', 11) });
    env.planner.planWeek();
    env.calendarChange.mockClear();
    return { env, hw, reading, essay };
  }

  it('shows a late start after the grace, and "Re-plan now" moves only the late task', () => {
    const { env, hw } = planned();
    const before = plannerBlocks(env);
    expect(view(env)).toEqual([
      'Calc HW 13:00–14:30',
      'Chem reading 15:50–16:50',
      'Essay 17:00–18:30',
      'Essay 18:40–19:10',
    ]);
    env.clock.set(at('13:09'));
    expect(env.planner.behind()).toBeNull();
    env.clock.set(at('13:30'));
    expect(env.planner.behind()).toMatchObject({
      taskId: hw.id,
      title: 'Calc HW',
      plannedStartAt: at('13:00'),
      sinceAt: at('13:00'),
      lateMin: 30,
      stopped: false,
    });
    // Nothing moved on its own.
    expect(plannerBlocks(env)).toEqual(before);

    const run = env.planner.replan('manual');
    expect(view(env)).toEqual([
      'Calc HW 13:30–15:00',
      'Chem reading 15:50–16:50',
      'Essay 17:00–18:30',
      'Essay 18:40–19:10',
    ]);
    // The others are the same rows.
    expect(
      plannerBlocks(env)
        .slice(1)
        .map((b) => b.id),
    ).toEqual(before.slice(1).map((b) => b.id));
    expect(run).toMatchObject({
      trigger: 'manual',
      fallback: 'none',
      warnings: [],
      changes: [
        {
          taskId: hw.id,
          title: 'Calc HW',
          kind: 'moved',
          from: at('13:00'),
          to: at('13:30'),
          minutes: 90,
        },
      ],
    });
    expect(env.replanned).toHaveBeenCalledWith(run);
    expect(env.planner.behind()).toBeNull();
  });

  it('counts lateness from when work stopped during the block, and keeps that time', () => {
    const { env, hw } = planned();
    env.timer.start(hw.id, at('13:00'));
    env.clock.set(at('13:20'));
    env.timer.pause();
    env.clock.set(at('13:35'));
    expect(env.planner.behind()).toMatchObject({
      sinceAt: at('13:20'),
      lateMin: 15,
      stopped: true,
    });
    env.planner.replan('manual');
    // 8:00–8:20 happened and stays on the calendar; the 70 minutes left start now (the 15
    // minutes since the pause were the break).
    expect(view(env).slice(0, 2)).toEqual(['Calc HW 13:00–13:35', 'Calc HW 13:35–14:45']);
  });

  it('plans nothing on its own until there is a plan', () => {
    const env = setup();
    env.task('Calc HW', { estimateMin: 90 });
    expect(env.planner.flush()).toBeNull();
    expect(plannerBlocks(env)).toEqual([]);
    expect(env.replanned).not.toHaveBeenCalled();
  });

  it('re-plans after task edits, keeping what still works', () => {
    const { env, essay } = planned();
    const before = plannerBlocks(env);
    const quiz = env.task('Quiz prep', { estimateMin: 30, dueAt: at('04:59', 8) });
    env.update(essay.id, { estimateMin: 90 });
    const run = env.planner.flush();
    expect(run?.trigger).toBe('edit');
    // The essay's second block goes (90 minutes now), and the quiz takes its time.
    expect(view(env)).toEqual([
      'Calc HW 13:00–14:30',
      'Chem reading 15:50–16:50',
      'Essay 17:00–18:30',
      'Quiz prep 18:40–19:10',
    ]);
    expect(
      plannerBlocks(env)
        .slice(0, 3)
        .map((b) => b.id),
    ).toEqual(before.slice(0, 3).map((b) => b.id));
    expect(run?.changes.map((c) => [c.title, c.kind])).toEqual([
      ['Essay', 'removed'],
      ['Quiz prep', 'added'],
    ]);
    expect(quiz.deadline).toBe('hard');
  });

  it('ends the block and re-packs the rest of today when a task is finished early', () => {
    const { env, hw } = planned();
    env.timer.start(hw.id, at('13:00'));
    env.clock.set(at('13:45'));
    env.complete(hw.id, 'Done early');
    // The block ends at once; the re-plan follows when changes settle.
    expect(view(env)[0]).toBe('Calc HW 13:00–13:45');
    const run = env.planner.flush();
    expect(run?.trigger).toBe('finish');
    expect(view(env)).toEqual([
      'Calc HW 13:00–13:45',
      'Chem reading 13:55–14:55',
      'Essay 15:50–17:20',
      'Essay 17:30–18:00',
    ]);
    // A finished task's blocks going away isn't listed.
    expect(run?.changes.map((c) => [c.title, c.kind])).toEqual([
      ['Chem reading', 'moved'],
      ['Essay', 'moved'],
    ]);
  });

  it('treats stopping the timer like finishing early, but not pausing', () => {
    const { env, hw } = planned();
    env.timer.start(hw.id, at('13:00'));
    env.clock.set(at('13:40'));
    env.timer.pause();
    expect(env.planner.flush()).toBeNull();
    expect(view(env)[0]).toBe('Calc HW 13:00–14:30');
    env.timer.resume();
    env.clock.set(at('14:00'));
    env.timer.stop();
    expect(view(env)[0]).toBe('Calc HW 13:00–14:00');
    expect(env.planner.flush()?.trigger).toBe('finish');
  });

  it('extends an overrunning block and pushes what follows, never into a class', () => {
    const env = setup();
    const hw = env.task('Calc HW', { estimateMin: 60, dueAt: at('04:59', 8) });
    env.task('Chem reading', { estimateMin: 45, dueAt: at('04:59', 9) });
    env.planner.planWeek();
    expect(view(env)).toEqual(['Calc HW 13:00–14:00', 'Chem reading 14:10–14:55']);
    env.timer.start(hw.id, at('13:00'));
    env.clock.set(at('13:59'));
    expect(env.planner.tick()).toBeNull();
    // 9:01 and still going: the block grows to 9:20 and the reading moves after it.
    env.clock.set(at('14:01'));
    const run = env.planner.tick();
    expect(run?.trigger).toBe('overrun');
    expect(view(env)).toEqual(['Calc HW 13:00–14:20', 'Chem reading 15:50–16:35']);
    expect(plannerBlocks(env)[0]?.reason).toContain('Ran over');
    // Still covered: nothing to do.
    env.clock.set(at('14:10'));
    expect(env.planner.tick()).toBeNull();
    // 9:50: the block can grow only to MATH at 10:00.
    env.clock.set(at('14:50'));
    env.planner.tick();
    expect(view(env)[0]).toBe('Calc HW 13:00–15:00');
    // In class, it can't grow at all.
    env.clock.set(at('15:01'));
    expect(env.planner.tick()).toBeNull();
    expect(env.log.error).not.toHaveBeenCalled();
  });

  it('keeps a laundry run under way whole', () => {
    const env = setup();
    env.task('Laundry', {
      attention: 'background',
      steps: [
        { title: 'Load', minutes: 5, wait: false },
        { title: 'washer', minutes: 45, wait: true },
        { title: 'Fold', minutes: 15, wait: false },
      ],
    });
    env.task('Study', { estimateMin: 120 });
    env.planner.planWeek();
    const laundry = () => plannerBlocks(env).filter((b) => b.label.startsWith('Laundry'));
    const before = laundry();
    // During the wait, a re-plan leaves every step where it is.
    env.clock.set(new Date(Date.parse(before[1]?.startAt ?? '') + 10 * 60_000).toISOString());
    env.planner.replan('manual');
    expect(laundry()).toEqual(before);
  });

  it('moves the blocks a new class lands on, and only those', () => {
    const { env } = planned();
    const before = plannerBlocks(env);
    env.fixed({
      title: 'CHEM lab',
      kind: 'class',
      startDate: '2026-10-07',
      startLocal: '12:00',
      endLocal: '12:30',
    });
    const run = env.planner.flush();
    // The lab (12:00–12:30 local) lands on the essay's first block; its 30-minute block stays.
    expect(view(env)).toEqual([
      'Calc HW 13:00–14:30',
      'Chem reading 15:50–16:50',
      'Essay 18:40–19:10',
      'Essay 19:20–20:50',
    ]);
    expect(
      plannerBlocks(env)
        .slice(0, 3)
        .map((b) => b.id),
    ).toEqual([before[0], before[1], before[3]].map((b) => b?.id));
    expect(run?.changes.map((c) => [c.title, c.kind])).toEqual([['Essay', 'moved']]);
  });

  it('clears a waiting re-plan with the plan', () => {
    const { env } = planned();
    env.task('Quiz prep', { estimateMin: 30 });
    env.planner.clear();
    expect(env.planner.flush()).toBeNull();
    expect(plannerBlocks(env)).toEqual([]);
  });
});
