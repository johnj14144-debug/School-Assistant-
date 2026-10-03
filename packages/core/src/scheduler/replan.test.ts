import { describe, expect, it } from 'vitest';
import {
  type PlanInput,
  type PlannedBlock,
  type PlanTask,
  type PreviousBlock,
  planWeek,
  type ReplanInput,
  replan,
} from './plan';
import { fixedBetween, local, minutesOf, ms, overlaps, planTask, ZONE } from './test-fixtures';

// Mon Oct 5, 2026, 8:00 AM in Houston (breakfast just ended).
const NOW = '2026-10-05T13:00:00.000Z';
const UNTIL = '2026-10-12T05:00:00.000Z';
const MONDAY_END = new Date('2026-10-06T05:00:00.000Z');
const fixed = fixedBetween(NOW, UNTIL);
const at = (hhmm: string, day = 5) => `2026-10-${String(day).padStart(2, '0')}T${hhmm}:00.000Z`;

function setup(tasks: PlanTask[], fields: Partial<PlanInput> = {}) {
  const input: PlanInput = {
    now: new Date(NOW),
    until: new Date(UNTIL),
    timeZone: ZONE,
    tasks,
    fixed,
    kept: [],
    ...fields,
  };
  const first = planWeek(input);
  const previous: PreviousBlock[] = first.blocks.map((b, i) => ({
    id: `p${i}`,
    taskId: b.taskId,
    startAt: b.startAt,
    endAt: b.endAt,
    kind: b.kind,
  }));
  const again = (fields: Partial<ReplanInput> = {}) => replan({ ...input, previous, ...fields });
  return { input, first, previous, again };
}

const spans = (blocks: readonly Pick<PlannedBlock, 'startAt' | 'endAt'>[]) =>
  blocks.map((b) => `${local(b.startAt)}–${local(b.endAt).split(' ')[1]}`);
/** "p3 Mon 10:50–11:50" for kept blocks, "new Mon 8:30–10:00" otherwise. */
const described = (blocks: readonly PlannedBlock[]) =>
  blocks.map((b, i) => `${b.previousId ?? 'new'} ${spans(blocks)[i]}`);

describe('replan', () => {
  const a = planTask({ title: 'A', subject: 'math', remainingMin: 90, dueAt: at('04:59', 7) });
  const b = planTask({ title: 'B', subject: 'chem', remainingMin: 60, dueAt: at('04:59', 7) });
  const c = planTask({ title: 'C', subject: 'hist', remainingMin: 120, dueAt: at('04:59', 8) });
  const d = planTask({ title: 'D', subject: 'engl', remainingMin: 180, dueAt: at('04:59', 9) });

  it('keeps every block when nothing changed', () => {
    const { first, again } = setup([a, b, c, d]);
    const out = again();
    expect(out.fallback).toBe('none');
    expect(spans(out.blocks)).toEqual(spans(first.blocks));
    expect(out.blocks.map((x) => x.previousId)).toEqual(['p0', 'p1', 'p2', 'p3', 'p4', 'p5']);
    expect(out.blocks[1]?.reason).toContain('Kept where it was planned.');
    expect(out.warnings).toEqual([]);
  });

  it('after a late start, starts the late task now and moves nothing else', () => {
    const { first, previous, again } = setup([a, b, c, d]);
    expect(spans(first.blocks.slice(0, 2))).toEqual(['Mon 8:00–9:30', 'Mon 10:50–11:50']);
    // 8:30 and A (8:00–9:30) hasn't started: its block is released, "Re-plan now".
    const out = again({
      now: new Date(at('13:30')),
      previous: previous.slice(1),
      startNowTaskId: a.id,
    });
    expect(out.fallback).toBe('none');
    expect(described(out.blocks)).toEqual([
      'new Mon 8:30–10:00',
      'p1 Mon 10:50–11:50',
      'p2 Mon 12:50–14:20',
      'p3 Mon 14:30–16:00',
      'p4 Mon 16:10–16:40',
      'p5 Mon 16:50–18:20',
    ]);
    expect(out.blocks[0]?.reason).toContain('The first free time after a late start.');
  });

  it('cuts the late task to fit the time before the next kept block', () => {
    const e = planTask({ title: 'E', subject: 'e', remainingMin: 90, dueAt: at('04:59', 9) });
    const f = planTask({ title: 'F', subject: 'f', remainingMin: 30, dueAt: at('04:59', 8) });
    const { again } = setup([e, f]);
    // E's block was missed; F's stays at 9:10, so E gets 8:00–9:00 now and the rest later.
    const previous: PreviousBlock[] = [
      { id: 'f', taskId: f.id, startAt: at('14:10'), endAt: at('14:40'), kind: 'work' },
    ];
    const out = again({ previous, startNowTaskId: e.id });
    expect(out.fallback).toBe('none');
    const mine = out.blocks.filter((x) => x.taskId === e.id);
    expect(spans(mine)[0]).toBe('Mon 8:00–9:00');
    expect(mine.reduce((sum, x) => sum + minutesOf(x), 0)).toBe(90);
    expect(out.blocks.find((x) => x.taskId === f.id)).toMatchObject({ previousId: 'f' });
  });

  it('pushes the work an overrun runs into, and only that', () => {
    const first = planTask({
      title: 'First',
      subject: 'x',
      remainingMin: 60,
      dueAt: at('04:59', 7),
    });
    const next = planTask({ title: 'Next', subject: 'y', remainingMin: 50, dueAt: at('04:59', 7) });
    const { first: plan, previous, again } = setup([first, next, c, d]);
    expect(spans(plan.blocks.slice(0, 2))).toEqual(['Mon 8:00–9:00', 'Mon 9:10–10:00']);
    // 9:01 and First is still running: its block now runs to 9:15 (kept), so Next can't start
    // at 9:10 and moves; nothing else does.
    const out = again({
      now: new Date(at('14:01')),
      tasks: [next, c, d],
      kept: [{ startAt: NOW, endAt: at('14:15'), mode: 'work' }],
      previous: previous.slice(1),
      runningTaskId: first.id,
    });
    expect(out.fallback).toBe('none');
    const moved = out.blocks.filter((x) => x.previousId === undefined);
    expect(moved.map((x) => x.taskId)).toEqual([next.id]);
    expect(ms(moved[0]?.startAt ?? '')).toBeGreaterThanOrEqual(ms(at('14:25')));
    for (const x of out.blocks) for (const f of fixed) expect(overlaps(x, f)).toBe(false);
    const kept = out.blocks.filter((x) => x.previousId !== undefined);
    expect(kept.map((x) => x.previousId)).toEqual(previous.slice(2).map((p) => p.id));
  });

  it('re-packs the rest of the day after an early finish and keeps later days', () => {
    const big = planTask({ title: 'Big', subject: 'z', remainingMin: 900, dueAt: at('04:59', 10) });
    const { first, previous, again } = setup([a, b, c, d, big]);
    const tuesday = (blocks: readonly PlannedBlock[]) =>
      blocks.filter((x) => ms(x.startAt) >= MONDAY_END.getTime());
    // A (8:00–9:30) is done at 8:45.
    const out = again({
      now: new Date(at('13:45')),
      tasks: [b, c, d, big],
      kept: [{ startAt: NOW, endAt: at('13:45'), mode: 'work' }],
      previous: previous.slice(1),
      repackUntil: MONDAY_END,
    });
    expect(out.fallback).toBe('none');
    // Today: the same work, each block in turn no later than before, starting right after
    // the break.
    const today = (blocks: readonly PlannedBlock[]) =>
      blocks.filter((x) => ms(x.startAt) < MONDAY_END.getTime() && x.taskId !== a.id);
    const total = (blocks: readonly PlannedBlock[]) =>
      blocks.reduce((sum, x) => sum + minutesOf(x), 0);
    expect(total(today(out.blocks))).toBe(total(today(first.blocks)));
    expect(local(today(out.blocks)[0]?.startAt ?? '')).toBe('Mon 8:55');
    today(first.blocks).forEach((before, i) => {
      expect(ms(today(out.blocks)[i]?.startAt ?? '')).toBeLessThanOrEqual(ms(before.startAt));
    });
    // Tuesday on: untouched.
    expect(tuesday(out.blocks).map((x) => [x.previousId, x.startAt, x.endAt])).toEqual(
      tuesday(first.blocks).map((x) => [
        previous.find((p) => p.startAt === x.startAt)?.id,
        x.startAt,
        x.endAt,
      ]),
    );
  });

  it('drops the blocks of a finished task and leaves the gap', () => {
    const { previous, again } = setup([a, b, c, d]);
    const out = again({ tasks: [a, c, d] });
    expect(out.blocks.every((x) => x.previousId !== undefined)).toBe(true);
    expect(out.blocks.map((x) => x.previousId)).toEqual(
      previous.filter((p) => p.taskId !== b.id).map((p) => p.id),
    );
  });

  it('adds a raised estimate after the blocks that stay', () => {
    const { previous, again } = setup([a, b, c, d]);
    const out = again({ tasks: [{ ...a, remainingMin: 150 }, b, c, d] });
    expect(out.fallback).toBe('none');
    expect(out.blocks.filter((x) => x.previousId).map((x) => x.previousId)).toEqual(
      previous.map((p) => p.id),
    );
    const extra = out.blocks.filter((x) => !x.previousId);
    expect(extra.map((x) => [x.taskId, minutesOf(x)])).toEqual([[a.id, 60]]);
  });

  it('shortens the last kept block for a lowered estimate, never leaving a sliver', () => {
    const essay = planTask({ title: 'Essay', subject: 'e', remainingMin: 180 });
    const { first, again } = setup([essay]);
    expect(spans(first.blocks)).toEqual(['Mon 8:00–9:30', 'Mon 12:50–14:20']);
    // 110 minutes left: keeping 90 would leave 20, under the 30-minute minimum, so the first
    // block gives up 10 and 30 are planned anew; the second block goes.
    const out = again({ tasks: [{ ...essay, remainingMin: 110 }] });
    expect(described(out.blocks)).toEqual(['p0 Mon 8:00–9:20', 'new Mon 9:30–10:00']);
  });

  it('moves only the blocks a new class lands on', () => {
    const { first, again } = setup([a, b, c, d]);
    const club = fixedBetween(NOW, UNTIL, [
      {
        title: 'Lab',
        kind: 'class',
        startDate: '2026-10-05',
        startLocal: '11:00',
        endLocal: '11:30',
        rrule: null,
        timeZone: ZONE,
        exceptions: [],
      },
    ]);
    const out = again({ fixed: [...fixed, ...club] });
    expect(out.fallback).toBe('none');
    const moved = out.blocks.filter((x) => !x.previousId);
    // B (10:50–11:50) overlapped the lab.
    expect(moved.map((x) => x.taskId)).toEqual([b.id]);
    expect(out.blocks.filter((x) => x.previousId)).toHaveLength(first.blocks.length - 1);
    for (const x of out.blocks) for (const f of club) expect(overlaps(x, f)).toBe(false);
  });

  it('releases a block that now sits too close to kept work', () => {
    const { previous, again } = setup([a, b, c, d]);
    // A manual block 11:50–12:00 right after B (10:50–11:50) leaves B no break.
    const out = again({ kept: [{ startAt: at('16:50'), endAt: at('17:00'), mode: 'work' }] });
    expect(out.blocks.find((x) => x.taskId === b.id)?.previousId).toBeUndefined();
    expect(out.blocks.filter((x) => x.previousId).map((x) => x.previousId)).toEqual(
      previous.filter((p) => p.taskId !== b.id).map((p) => p.id),
    );
  });

  it('releases a block right before kept work just past the plan', () => {
    const task = planTask({ title: 'T', remainingMin: 120 });
    const until = new Date(at('14:00'));
    const { again } = setup([task], { until });
    const previous: PreviousBlock[] = [
      { id: 'late', taskId: task.id, startAt: at('13:00'), endAt: at('14:00'), kind: 'work' },
    ];
    const out = again({
      previous,
      kept: [{ startAt: at('14:00'), endAt: at('14:30'), mode: 'work' }],
    });
    expect(described(out.blocks)).toEqual(['new Mon 8:00–8:50']);
  });

  it('gives up kept blocks when keeping them costs a deadline', () => {
    const big = planTask({ title: 'Big', subject: 'z', remainingMin: 900, dueAt: at('04:59', 11) });
    const { previous, again } = setup([a, b, c, d, big]);
    // New: 4 hours due Monday 5 PM. The kept blocks leave too little time before then.
    const urgent = planTask({
      title: 'Urgent',
      subject: 'u',
      remainingMin: 240,
      dueAt: at('22:00'),
    });
    const tasks = [a, b, c, d, big, urgent];
    const out = again({ tasks });
    const fresh = planWeek({
      now: new Date(NOW),
      until: new Date(UNTIL),
      timeZone: ZONE,
      tasks,
      fixed,
      kept: [],
    });
    expect(fresh.warnings).toEqual([]);
    expect(out.warnings).toEqual([]);
    expect(out.fallback).toBe('partial');
    // Blocks of the last plan after the urgent due date stay where they were.
    const later = previous.filter((p) => ms(p.startAt) >= ms(urgent.dueAt));
    expect(later.length).toBeGreaterThan(0);
    for (const p of later) {
      expect(out.blocks.find((x) => x.previousId === p.id)).toMatchObject({
        startAt: p.startAt,
        endAt: p.endAt,
      });
    }
  });

  it('keeps the plan when a fresh one would miss as much', () => {
    // Overdue work can't be helped by moving anything.
    const overdue = planTask({ title: 'Overdue', remainingMin: 60, dueAt: at('12:00') });
    const { previous, again } = setup([a, b, c, d]);
    const out = again({ tasks: [a, b, c, d, overdue] });
    expect(out.fallback).toBe('none');
    expect(out.warnings.map((w) => w.kind)).toEqual(['overdue']);
    expect(out.blocks.map((x) => x.previousId)).toEqual(previous.map((p) => p.id));
  });

  it('keeps blocks for a soft deadline already past and says so', () => {
    const soft = planTask({
      title: 'Soft',
      remainingMin: 60,
      deadline: 'soft',
      dueAt: at('12:00'),
    });
    const { again } = setup([soft]);
    const out = again();
    expect(out.blocks).toEqual([expect.objectContaining({ previousId: 'p0' })]);
    expect(out.warnings.map((w) => w.kind)).toEqual(['late']);
  });

  describe('steps', () => {
    const laundry = planTask({
      title: 'Laundry',
      background: true,
      steps: [
        { title: 'Load', minutes: 5, wait: false },
        { title: 'washer', minutes: 45, wait: true },
        { title: 'Fold', minutes: 15, wait: false },
      ],
    });

    it('keeps a sequence whole when it still fits', () => {
      const { previous, again } = setup([laundry, d]);
      const out = again();
      expect(out.blocks.map((x) => x.previousId)).toEqual(previous.map((p) => p.id));
      const steps = out.blocks.filter((x) => x.taskId === laundry.id);
      expect(steps.map((x) => x.reason.endsWith('Kept where it was planned.'))).toEqual([
        true,
        true,
        true,
      ]);
    });

    it('plans the whole sequence again when one step lost its time', () => {
      const { previous, again } = setup([laundry]);
      const fold = previous.find((p) => p.kind === 'step' && p !== previous[0]) as PreviousBlock;
      const out = again({ kept: [{ startAt: fold.startAt, endAt: fold.endAt, mode: 'busy' }] });
      expect(out.blocks).toHaveLength(3);
      expect(out.blocks.every((x) => x.previousId === undefined)).toBe(true);
    });

    it('plans the sequence again when its steps changed', () => {
      const { again } = setup([laundry]);
      const changed = { ...laundry, steps: laundry.steps.slice(0, 2) };
      const out = again({ tasks: [changed] });
      expect(out.blocks.map((x) => [x.kind, x.previousId])).toEqual([
        ['step', undefined],
        ['wait', undefined],
      ]);
    });
  });
});
