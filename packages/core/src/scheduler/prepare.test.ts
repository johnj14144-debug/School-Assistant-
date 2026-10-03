import { describe, expect, it } from 'vitest';
import { type PlannableTask, planHorizon, preparePlan } from './prepare';

const UNTIL = new Date('2026-10-12T05:00:00.000Z');
let n = 0;

function task(fields: Partial<PlannableTask> = {}): PlannableTask {
  n++;
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    parentId: null,
    title: `Task ${n}`,
    courseId: null,
    priority: 'normal',
    attention: 'focus',
    estimateMin: 60,
    dueAt: null,
    earliestStartAt: null,
    splittable: true,
    minChunkMin: 30,
    allowLate: false,
    steps: [],
    status: 'open',
    createdAt: '2026-10-01T00:00:00.000Z',
    ...fields,
  };
}

const prepare = (
  tasks: PlannableTask[],
  actual: Record<string, number> = {},
  kept: Record<string, number> = {},
) =>
  preparePlan({
    tasks,
    actualMin: new Map(Object.entries(actual)),
    keptMin: new Map(Object.entries(kept)),
    until: UNTIL,
  });

describe('preparePlan', () => {
  it('plans what is left of each open task', () => {
    const hw = task({ courseId: 'math', estimateMin: 90, dueAt: '2026-10-07T04:59:00.000Z' });
    const done = task({ status: 'done' });
    const { tasks, warnings } = prepare([hw, done], { [hw.id]: 25.5 }, { [hw.id]: 30 });
    expect(warnings).toEqual([]);
    expect(tasks).toEqual([
      expect.objectContaining({
        id: hw.id,
        subject: 'math',
        remainingMin: 35,
        dueAt: '2026-10-07T04:59:00.000Z',
        background: false,
      }),
    ]);
  });

  it('plans subtasks instead of their parent, with the earliest due date up the tree', () => {
    const parent = task({
      dueAt: '2026-10-08T04:59:00.000Z',
      earliestStartAt: '2026-10-06T13:00:00.000Z',
    });
    const a = task({ parentId: parent.id, dueAt: '2026-10-09T04:59:00.000Z' });
    const b = task({ parentId: parent.id, earliestStartAt: '2026-10-05T13:00:00.000Z' });
    const doneChild = task({ parentId: a.id, status: 'done' });
    const { tasks } = prepare([parent, a, b, doneChild]);
    expect(tasks.map((t) => [t.id, t.dueAt, t.earliestStartAt, t.subject])).toEqual([
      [a.id, '2026-10-08T04:59:00.000Z', '2026-10-06T13:00:00.000Z', `task:${parent.id}`],
      [b.id, '2026-10-08T04:59:00.000Z', '2026-10-06T13:00:00.000Z', `task:${parent.id}`],
    ]);
  });

  it('plans a parent once its subtasks are done, minus the time they took', () => {
    const parent = task({ estimateMin: 180 });
    const child = task({ parentId: parent.id, status: 'done' });
    const { tasks } = prepare([parent, child], { [parent.id]: 60 });
    expect(tasks.map((t) => [t.id, t.remainingMin])).toEqual([[parent.id, 120]]);
  });

  it('warns about tasks without an estimate or with the estimate used up', () => {
    const none = task({ title: 'Buy a calculator', estimateMin: null });
    const spent = task({ title: 'Calc HW', estimateMin: 60 });
    const covered = task({ estimateMin: 60 });
    const { tasks, warnings } = prepare(
      [none, spent, covered],
      { [spent.id]: 75 },
      { [covered.id]: 60 },
    );
    expect(tasks).toEqual([]);
    expect(warnings).toEqual([
      expect.objectContaining({
        kind: 'no-estimate',
        taskId: none.id,
        message: "Buy a calculator has no estimate, so it isn't planned.",
        options: ['edit-task'],
      }),
      expect.objectContaining({
        kind: 'spent',
        taskId: spent.id,
        message:
          "Calc HW has used its 1h estimate but isn't done; raise the estimate to plan more time.",
      }),
    ]);
  });

  it('plans tasks with steps whole, unless a kept block is already on the calendar', () => {
    const steps = [{ title: 'Load', minutes: 5, wait: false }];
    const laundry = task({ attention: 'background', estimateMin: null, steps });
    const planned = task({ steps });
    const { tasks, warnings } = prepare([laundry, planned], {}, { [planned.id]: 5 });
    expect(warnings).toEqual([]);
    expect(tasks.map((t) => [t.id, t.background, t.steps.length])).toEqual([[laundry.id, true, 1]]);
  });

  it('skips work that may not start before the plan ends', () => {
    const later = task({ earliestStartAt: '2026-10-12T05:00:00.000Z' });
    expect(prepare([later]).tasks).toEqual([]);
  });
});

describe('planHorizon', () => {
  it('runs to midnight at the end of the seventh day, in local time', () => {
    const now = new Date('2026-10-29T15:00:00.000Z'); // Thu 10 AM in Houston
    // Clocks fall back on Sun Nov 1, so midnight on Thu Nov 5 is 06:00 UTC.
    expect(planHorizon(now, 'America/Chicago')).toEqual({
      from: now,
      until: new Date('2026-11-05T06:00:00.000Z'),
    });
  });
});
