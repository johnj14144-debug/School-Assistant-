import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { FixedEventKind } from '../calendar/schemas';
import {
  DEFAULT_PLAN_SETTINGS,
  type PlanInput,
  type PlanKept,
  type PlannedBlock,
  type PlanOutcome,
  type PlanSettings,
  type PlanTask,
  planWeek,
} from './plan';
import { fixedBetween, ms, overlaps, ROUTINE, ZONE } from './test-fixtures';

/**
 * Property-based tests (fast-check): random weeks of routine, kept blocks and tasks. Whatever
 * the input, the plan must keep the rules; when the work clearly fits, every deadline is met.
 */

const MIN = 60_000;
const HOUR = 60 * MIN;
// Oct 1 – Nov 10, 2026: covers the November change in Houston.
const FIRST = Date.parse('2026-10-01T00:00:00.000Z');
const LAST = Date.parse('2026-11-10T00:00:00.000Z');
const HARD_KINDS: ReadonlySet<FixedEventKind> = new Set(['sleep', 'class', 'other']);

const iso = (t: number) => new Date(t).toISOString();
const id = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
const ceil5 = (m: number) => Math.ceil(m / 5) * 5;

const settingsArb: fc.Arbitrary<PlanSettings> = fc.record({
  maxChunkMin: fc.integer({ min: 6, max: 36 }).map((n) => n * 5),
  breakMin: fc.integer({ min: 0, max: 4 }).map((n) => n * 5),
  stepToleranceMin: fc.integer({ min: 0, max: 12 }).map((n) => n * 5),
  interleave: fc.boolean(),
});

const routineArb = fc
  .subarray(ROUTINE.slice(1), { minLength: 0 })
  .map((events) => [ROUTINE[0] as (typeof ROUTINE)[number], ...events]);

interface Scenario {
  now: number;
  days: number;
  routine: typeof ROUTINE;
  settings: PlanSettings;
  kept: { offsetMin: number; lengthMin: number; mode: PlanKept['mode'] }[];
  tasks: {
    remainingMin: number;
    dueOffsetMin: number | null;
    startOffsetMin: number | null;
    splittable: boolean;
    minChunkMin: number;
    allowLate: boolean;
    priority: PlanTask['priority'];
    subject: number;
    kind: 'focus' | 'background' | 'steps';
    steps: { minutes: number; wait: boolean }[];
  }[];
  running: number | null;
}

const taskArb = fc.record({
  remainingMin: fc.integer({ min: 1, max: 400 }),
  dueOffsetMin: fc.option(fc.integer({ min: -24 * 60, max: 4 * 24 * 60 }), { nil: null }),
  startOffsetMin: fc.option(fc.integer({ min: -60, max: 3 * 24 * 60 }), { nil: null }),
  splittable: fc.constantFrom(true, true, true, false),
  minChunkMin: fc.integer({ min: 1, max: 18 }).map((n) => n * 5),
  allowLate: fc.boolean(),
  priority: fc.constantFrom('low', 'normal', 'high') as fc.Arbitrary<PlanTask['priority']>,
  subject: fc.integer({ min: 0, max: 4 }),
  kind: fc.constantFrom('focus', 'focus', 'focus', 'focus', 'background', 'steps') as fc.Arbitrary<
    'focus' | 'background' | 'steps'
  >,
  steps: fc.array(fc.record({ minutes: fc.integer({ min: 1, max: 90 }), wait: fc.boolean() }), {
    minLength: 1,
    maxLength: 5,
  }),
});

const scenarioArb: fc.Arbitrary<Scenario> = fc.record({
  now: fc.integer({ min: FIRST, max: LAST }),
  days: fc.integer({ min: 1, max: 3 }),
  routine: routineArb,
  settings: settingsArb,
  kept: fc.array(
    fc.record({
      offsetMin: fc.integer({ min: -60, max: 3 * 24 * 60 }),
      lengthMin: fc.integer({ min: 30, max: 180 }),
      mode: fc.constantFrom('work', 'busy', 'background') as fc.Arbitrary<PlanKept['mode']>,
    }),
    { maxLength: 4 },
  ),
  tasks: fc.array(taskArb, { maxLength: 14 }),
  running: fc.option(fc.integer({ min: 0, max: 13 }), { nil: null }),
});

function inputOf(s: Scenario): PlanInput {
  const until = s.now + s.days * 24 * HOUR;
  return {
    now: new Date(s.now),
    until: new Date(until),
    timeZone: ZONE,
    fixed: fixedBetween(iso(s.now - 24 * HOUR), iso(until + 24 * HOUR), s.routine),
    kept: s.kept.map((k) => ({
      startAt: iso(s.now + k.offsetMin * MIN),
      endAt: iso(s.now + (k.offsetMin + k.lengthMin) * MIN),
      mode: k.mode,
    })),
    tasks: s.tasks.map((t, i) => ({
      id: id(i),
      title: `Task ${i}`,
      subject: `course-${t.subject}`,
      priority: t.priority,
      background: t.kind === 'background',
      remainingMin: t.remainingMin,
      dueAt: t.dueOffsetMin === null ? null : iso(s.now + t.dueOffsetMin * MIN),
      earliestStartAt: t.startOffsetMin === null ? null : iso(s.now + t.startOffsetMin * MIN),
      splittable: t.splittable,
      minChunkMin: t.minChunkMin,
      allowLate: t.allowLate,
      steps:
        t.kind === 'steps'
          ? t.steps.map((st, j) => ({ title: `step ${j}`, minutes: st.minutes, wait: st.wait }))
          : [],
      createdAt: iso(FIRST + i * MIN),
    })),
    runningTaskId: s.running === null ? null : id(s.running),
    settings: s.settings,
  };
}

const isWait = (b: PlannedBlock, task: PlanTask) =>
  b.kind === 'wait' || (b.kind === 'work' && task.background);

/** Every rule a plan must keep, whatever the input. */
function checkRules(input: PlanInput, out: PlanOutcome): void {
  const settings = { ...DEFAULT_PLAN_SETTINGS, ...input.settings };
  const tasks = new Map(input.tasks.map((t) => [t.id, t]));
  const from = ms(out.from);
  expect(from).toBeGreaterThanOrEqual(input.now.getTime());
  expect(from - input.now.getTime()).toBeLessThan(5 * MIN);

  const handsOn: PlannedBlock[] = [];
  const work: PlannedBlock[] = [];
  for (const b of out.blocks) {
    const task = tasks.get(b.taskId);
    if (!task) throw new Error(`Unknown task ${b.taskId}`);
    const [s, e] = [ms(b.startAt), ms(b.endAt)];
    // Inside the plan, on the 5-minute grid.
    expect(e).toBeGreaterThan(s);
    expect(s).toBeGreaterThanOrEqual(from);
    expect(e).toBeLessThanOrEqual(input.until.getTime());
    expect((s - from) % (5 * MIN)).toBe(0);
    expect((e - from) % (5 * MIN)).toBe(0);
    if (task.earliestStartAt) expect(s).toBeGreaterThanOrEqual(ms(task.earliestStartAt));
    if (task.dueAt && !task.allowLate) expect(e).toBeLessThanOrEqual(ms(task.dueAt));
    // Never in sleep, classes or other commitments; hands-on time never over any fixed event.
    const wait = isWait(b, task);
    for (const f of input.fixed) {
      if (!overlaps(b, f)) continue;
      expect(HARD_KINDS.has(f.kind), `${b.kind} over ${f.kind}`).toBe(false);
      expect(wait, `hands-on ${b.kind} over ${f.kind}`).toBe(true);
    }
    if (!wait) {
      for (const k of input.kept) {
        if (k.mode !== 'background') expect(overlaps(b, k), 'over a kept block').toBe(false);
      }
      handsOn.push(b);
      if (b.kind === 'work') work.push(b);
    }
  }
  // Hands-on blocks never overlap each other.
  const sorted = handsOn.toSorted((a, b) => a.startAt.localeCompare(b.startAt));
  for (let i = 1; i < sorted.length; i++) {
    expect(ms(sorted[i]?.startAt ?? '')).toBeGreaterThanOrEqual(ms(sorted[i - 1]?.endAt ?? ''));
  }
  // A break between work blocks, planned or kept.
  const keptWork = input.kept.filter((k) => k.mode === 'work');
  for (const a of work) {
    for (const b of [...work, ...keptWork]) {
      if (a === b || overlaps(a, b)) continue;
      const gap =
        ms(a.startAt) >= ms(b.endAt) ? ms(a.startAt) - ms(b.endAt) : ms(b.startAt) - ms(a.endAt);
      expect(gap, 'break between work blocks').toBeGreaterThanOrEqual(settings.breakMin * MIN);
    }
  }
  // Per task: never more than the work left; chunk sizes; steps all or nothing, in order.
  for (const task of input.tasks) {
    const mine = out.blocks.filter((b) => b.taskId === task.id);
    if (task.steps.length > 0) {
      if (mine.length === 0) continue;
      expect(mine.length).toBe(task.steps.length);
      task.steps.forEach((step, i) => {
        const b = mine[i] as PlannedBlock;
        expect(b.kind).toBe(step.wait ? 'wait' : 'step');
        expect(ms(b.endAt) - ms(b.startAt)).toBe(ceil5(step.minutes) * MIN);
        if (i === 0) return;
        const gap = ms(b.startAt) - ms(mine[i - 1]?.endAt ?? '');
        expect(gap).toBeGreaterThanOrEqual(0);
        const allowed = task.steps[i - 1]?.wait && !step.wait ? settings.stepToleranceMin : 0;
        expect(gap).toBeLessThanOrEqual(allowed * MIN);
      });
      continue;
    }
    const total = mine.reduce((sum, b) => sum + (ms(b.endAt) - ms(b.startAt)) / MIN, 0);
    expect(total).toBeLessThanOrEqual(ceil5(task.remainingMin));
    if (task.background) {
      expect(mine.length).toBeLessThanOrEqual(1);
      if (mine.length === 1) expect(total).toBe(ceil5(task.remainingMin));
      continue;
    }
    if (!task.splittable) {
      expect(mine.length).toBeLessThanOrEqual(1);
      if (mine.length === 1) expect(total).toBe(ceil5(task.remainingMin));
      continue;
    }
    const maxLen = Math.max(settings.maxChunkMin, task.minChunkMin);
    const minLen = Math.min(task.minChunkMin, ceil5(task.remainingMin));
    for (const b of mine) {
      const len = (ms(b.endAt) - ms(b.startAt)) / MIN;
      // Longer only when the work can't make two chunks of the minimum.
      if (len > maxLen) expect(len).toBeLessThan(2 * task.minChunkMin);
      expect(len).toBeGreaterThanOrEqual(minLen);
    }
  }
  // Warnings name real tasks; a shortfall is exactly the work left unplanned.
  for (const w of out.warnings) {
    const task = tasks.get(w.taskId);
    expect(task).toBeDefined();
    if (w.kind === 'short' || w.kind === 'overdue') {
      const planned = out.blocks
        .filter((b) => b.taskId === w.taskId)
        .reduce((sum, b) => sum + (ms(b.endAt) - ms(b.startAt)) / MIN, 0);
      expect(w.minutes).toBe(ceil5(task?.remainingMin ?? 0) - planned);
    }
  }
}

describe('planWeek properties', () => {
  it('keeps every rule for any week', () => {
    fc.assert(
      fc.property(scenarioArb, (scenario) => {
        const input = inputOf(scenario);
        checkRules(input, planWeek(input));
      }),
      { numRuns: 300 },
    );
  }, 60_000);

  it('is deterministic', () => {
    fc.assert(
      fc.property(scenarioArb, (scenario) => {
        const input = inputOf(scenario);
        expect(planWeek(input)).toEqual(planWeek(input));
      }),
      { numRuns: 50 },
    );
  }, 60_000);

  it('meets every deadline when the work clearly fits', () => {
    const focusArb = fc.record({
      remainingMin: fc.integer({ min: 5, max: 180 }),
      dueOffsetMin: fc.option(fc.integer({ min: 120, max: 3 * 24 * 60 }), { nil: null }),
      minChunkMin: fc.integer({ min: 1, max: 12 }).map((n) => n * 5),
      priority: fc.constantFrom('low', 'normal', 'high') as fc.Arbitrary<PlanTask['priority']>,
      subject: fc.integer({ min: 0, max: 4 }),
    });
    const arb = fc.record({
      now: fc.integer({ min: FIRST, max: LAST }),
      days: fc.integer({ min: 1, max: 3 }),
      routine: routineArb,
      settings: settingsArb,
      tasks: fc.array(focusArb, { minLength: 1, maxLength: 10 }),
      running: fc.option(fc.integer({ min: 0, max: 11 }), { nil: null }),
    });
    let checked = 0;
    fc.assert(
      fc.property(arb, (s) => {
        const input = inputOf({
          ...s,
          kept: [],
          tasks: s.tasks.map((t) => ({
            ...t,
            startOffsetMin: null,
            splittable: true,
            allowLate: false,
            kind: 'focus',
            steps: [],
          })),
        });
        if (!clearlyFits(input)) return;
        checked++;
        const out = planWeek(input);
        checkRules(input, out);
        expect(out.warnings.filter((w) => w.kind === 'short')).toEqual([]);
      }),
      { numRuns: 1000 },
    );
    expect(checked).toBeGreaterThan(250);
  }, 60_000);
});

/**
 * A generous test of feasibility: for every due date, the work due by then is at most 40% of
 * the free time before it, counting only what's left of each free stretch after setting aside
 * two of the longest chunks and a break (time a chunked plan can lose at the stretch's ends).
 */
function clearlyFits(input: PlanInput): boolean {
  const settings = { ...DEFAULT_PLAN_SETTINGS, ...input.settings };
  const start = Math.ceil(input.now.getTime() / (5 * MIN)) * 5 * MIN;
  const maxLen = Math.max(settings.maxChunkMin, ...input.tasks.map((t) => t.minChunkMin));
  const lost = (2 * maxLen + settings.breakMin) * MIN;
  const busy = input.fixed
    .map((f) => [ms(f.startAt), ms(f.endAt)] as const)
    .sort((a, b) => a[0] - b[0]);
  const usableBefore = (due: number) => {
    let total = 0;
    let cursor = start;
    for (const [s, e] of [...busy, [due, due] as const]) {
      const end = Math.min(s, due);
      if (end > cursor) total += Math.max(0, end - cursor - lost);
      cursor = Math.max(cursor, e);
      if (cursor >= due) break;
    }
    return total;
  };
  const dated = input.tasks.filter((t) => t.dueAt && ms(t.dueAt) <= input.until.getTime());
  return dated.every((t) => {
    const due = ms(t.dueAt as string);
    const demand = dated
      .filter((u) => ms(u.dueAt as string) <= due)
      .reduce((sum, u) => sum + ceil5(u.remainingMin) * MIN, 0);
    return demand <= 0.4 * usableBefore(due);
  });
}
