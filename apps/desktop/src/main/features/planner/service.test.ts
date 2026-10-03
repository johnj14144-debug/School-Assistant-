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
