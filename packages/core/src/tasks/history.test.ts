import { describe, expect, it } from 'vitest';
import { type HistoryTaskNode, ownMinutes, rollupMinutes, typeGroups } from './history';
import type { SessionSpan } from './sessions';

const now = new Date('2026-10-07T20:00:00.000Z');
let n = 0;
/** A session of `minutes` on `taskId`, laid out one after another. */
function session(taskId: string, minutes: number): SessionSpan {
  const start = Date.parse('2026-10-07T08:00:00.000Z') + n * 3_600_000;
  n += 1;
  return {
    id: `s${n}`,
    taskId,
    startAt: new Date(start).toISOString(),
    endAt: new Date(start + minutes * 60_000).toISOString(),
  };
}
function task(id: string, patch: Partial<HistoryTaskNode> = {}): HistoryTaskNode {
  return {
    id,
    parentId: null,
    status: 'done',
    estimateMin: null,
    courseId: 'calc',
    type: 'homework',
    ...patch,
  };
}

describe('ownMinutes / rollupMinutes', () => {
  it('adds sessions per task, then up through every ancestor', () => {
    const sessions = [session('a', 30), session('a', 15), session('b', 20), session('c', 10)];
    sessions.push({ id: 'open', taskId: 'c', startAt: '2026-10-07T19:30:00.000Z', endAt: null });
    const own = ownMinutes(sessions, now);
    expect(Object.fromEntries(own)).toEqual({ a: 45, b: 20, c: 40 });

    const tasks = [
      task('a'),
      task('b', { parentId: 'a' }),
      task('c', { parentId: 'b' }),
      task('d'),
    ];
    expect(Object.fromEntries(rollupMinutes(tasks, own))).toEqual({ a: 105, b: 60, c: 40, d: 0 });
  });

  it('survives a parent cycle in bad data', () => {
    const tasks = [task('a', { parentId: 'b' }), task('b', { parentId: 'a' })];
    const rollup = rollupMinutes(tasks, new Map([['a', 10]]));
    expect(Object.fromEntries(rollup)).toEqual({ a: 10, b: 10 });
  });
});

describe('typeGroups', () => {
  it('groups finished tasks by course and type, ignoring case', () => {
    const tasks = [
      task('hw1', { estimateMin: 60 }),
      task('hw2', { estimateMin: 30, type: ' Homework ' }),
      task('hw3', { status: 'open', estimateMin: 30 }),
      task('read', { type: 'reading', courseId: null }),
    ];
    const own = new Map([
      ['hw1', 90],
      ['hw2', 45],
      ['hw3', 20],
      ['read', 200],
    ]);
    expect(typeGroups(tasks, own, rollupMinutes(tasks, own))).toEqual([
      {
        courseId: null,
        type: 'reading',
        doneCount: 1,
        spentMin: 200,
        compared: { count: 0, estimateMin: 0, actualMin: 0 },
      },
      {
        courseId: 'calc',
        type: 'homework',
        doneCount: 2,
        spentMin: 135,
        compared: { count: 2, estimateMin: 90, actualMin: 135 },
      },
    ]);
  });

  it('measures a task tree once, at the highest finished task with an estimate', () => {
    const tasks = [
      task('essay', { estimateMin: 360, type: 'writing' }),
      task('outline', { parentId: 'essay', estimateMin: 60, type: 'writing' }),
      task('draft', { parentId: 'essay', estimateMin: 180, type: 'writing' }),
    ];
    const own = new Map([
      ['essay', 30],
      ['outline', 90],
      ['draft', 240],
    ]);
    const [writing] = typeGroups(tasks, own, rollupMinutes(tasks, own));
    expect(writing).toMatchObject({
      doneCount: 3,
      spentMin: 360,
      compared: { count: 1, estimateMin: 360, actualMin: 360 },
    });

    // While the essay is open its finished subtasks are compared on their own.
    tasks[0] = task('essay', { estimateMin: 360, type: 'writing', status: 'open' });
    const [open] = typeGroups(tasks, own, rollupMinutes(tasks, own));
    expect(open?.compared).toEqual({ count: 2, estimateMin: 240, actualMin: 330 });
  });

  it('skips untimed tasks and tasks without an estimate in the comparison', () => {
    const tasks = [task('a', { estimateMin: 30 }), task('b'), task('c', { estimateMin: 0 })];
    const own = new Map([
      ['b', 40],
      ['c', 10],
    ]);
    const [group] = typeGroups(tasks, own, rollupMinutes(tasks, own));
    expect(group).toMatchObject({ doneCount: 3, spentMin: 50, compared: { count: 0 } });
  });
});
