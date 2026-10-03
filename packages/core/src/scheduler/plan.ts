import type { BlockKind, FixedEventKind } from '../calendar/schemas';
import { formatMinutes } from '../tasks/duration';
import type { TaskDeadline, TaskPriority } from '../tasks/schemas';
import type { TaskStep } from '../tasks/steps';
import { BUSY, Grid, HARD, SLOT_MIN, SLOT_MS, SOFT, WORK } from './grid';
import type { PlanOption, PlanWarning } from './schemas';

/**
 * Scheduler v1 (M5, ADR 0011): plans the week into blocks. Deterministic and pure (ADR 0002).
 *
 * 1. Tasks with steps (laundry) and background tasks go first: each hands-on step gets a short
 *    block and the waits run alongside other work. They take the earliest day where the whole
 *    sequence fits, at the time that cuts free time up the least.
 * 2. Focus and light work fills free 5-minute slots from now on, earliest deadline (least
 *    slack) first, in chunks no longer than the maximum, with a break between work blocks.
 *    When the next chunk would be the same subject as the last one, another subject goes
 *    first if everything due sooner still fits (interleaving). A one-sitting task takes a gap
 *    long enough for it when no later gap before its due date would do.
 *    Hard deadlines are never planned past; soft ones may be, when there's no room before.
 * 3. If hard work misses its due date or soft work runs late, the plan is redone without
 *    interleaving, then without the one-sitting and running-task preferences, then with soft
 *    deadlines yielding to hard ones; the plan with the least hard work missing (then the
 *    least soft work late) wins. What still doesn't fit becomes a warning with options.
 *
 * Every block carries a "why here" reason.
 *
 * Re-planning (M6, ADR 0012) is `replan`: the same steps, but the last plan's blocks that still
 * work stay where they are (sticky) and only the rest is placed in the time left. When keeping
 * them would cost a deadline that a fresh plan meets, it keeps less: only blocks after the last
 * due date in trouble, and failing that nothing (a fresh plan).
 */

export interface PlanTask {
  id: string;
  title: string;
  /** Interleaving key: the course, or the task tree for tasks without one. */
  subject: string;
  priority: TaskPriority;
  /** A background task without steps: one block that runs alongside other work. */
  background: boolean;
  /** Minutes still to plan (estimate minus time logged and blocks that stay). */
  remainingMin: number;
  /** False when the minutes come from the default estimate (the task has none). */
  estimated: boolean;
  dueAt: string;
  /** Hard: never planned past. Soft: may be, and gives way to hard deadlines. */
  deadline: TaskDeadline;
  earliestStartAt: string | null;
  splittable: boolean;
  minChunkMin: number;
  steps: readonly TaskStep[];
  createdAt: string;
}

export interface PlanFixed {
  kind: FixedEventKind;
  startAt: string;
  endAt: string;
}

/**
 * A block that stays where it is (manual, locked, or in progress): `work` is focus or light
 * work on a task, `busy` anything else that needs the user, `background` runs alongside.
 */
export interface PlanKept {
  startAt: string;
  endAt: string;
  mode: 'work' | 'busy' | 'background';
}

export interface PlanSettings {
  /** Longest focus block; a one-sitting task may be longer. */
  maxChunkMin: number;
  /** Free time between two work blocks. */
  breakMin: number;
  /** How late a hands-on step may start after its wait ends. */
  stepToleranceMin: number;
  interleave: boolean;
}

export const DEFAULT_PLAN_SETTINGS: PlanSettings = {
  maxChunkMin: 90,
  breakMin: 10,
  stepToleranceMin: 30,
  interleave: true,
};

export interface PlanInput {
  now: Date;
  until: Date;
  /** For reasons and warnings ("Due Tue, Oct 6, 11:59 PM") and for day boundaries. */
  timeZone: string;
  tasks: readonly PlanTask[];
  fixed: readonly PlanFixed[];
  kept: readonly PlanKept[];
  /** The focus task whose timer is running: it keeps the first block if it has work left. */
  runningTaskId?: string | null;
  settings?: Partial<PlanSettings>;
}

export interface PlannedBlock {
  taskId: string;
  /** Empty for work (the task's title shows); "Laundry: Fold" for a step. */
  title: string;
  startAt: string;
  endAt: string;
  kind: BlockKind;
  reason: string;
  /** Re-planning: the last plan's block this one keeps (its times may be shorter). */
  previousId?: string;
}

export interface PlanOutcome {
  /** In time order. */
  blocks: PlannedBlock[];
  warnings: PlanWarning[];
  /** UTC ISO instant of slot 0 (now, rounded up to 5 minutes). */
  from: string;
}

/** A block of the last plan that a re-plan may keep: the planner's own, unlocked, not started. */
export interface PreviousBlock {
  id: string;
  taskId: string;
  startAt: string;
  endAt: string;
  kind: BlockKind;
}

export interface ReplanInput extends PlanInput {
  previous: readonly PreviousBlock[];
  /**
   * Blocks starting before this lose their place and are planned again as early as they fit:
   * finishing early re-packs the rest of the day (owner decision Q12).
   */
  repackUntil?: Date | null;
  /**
   * A task whose block was missed (a late start, then "Re-plan now", Q13): its work starts in
   * the first free time, cut to fit there if needed. Nothing else moves for it.
   */
  startNowTaskId?: string | null;
}

/**
 * How much of the last plan a re-plan kept: everything that still works (`none`), only blocks
 * after the last due date in trouble (`partial`), or nothing, because only a fresh plan met the
 * deadlines (`full`).
 */
export type ReplanFallback = 'none' | 'partial' | 'full';

export interface ReplanOutcome extends PlanOutcome {
  fallback: ReplanFallback;
}

/** Share of free time that becomes work once breaks and short gaps are paid for. */
const EFFICIENCY = 0.75;
const PRIORITY_RANK: Record<TaskPriority, number> = { high: 0, normal: 1, low: 2 };

const slots = (minutes: number) => Math.ceil(minutes / SLOT_MIN);

/** "Plan my week": a fresh plan from now to `until`. */
export function planWeek(input: PlanInput): PlanOutcome {
  const ctx = context(input);
  const { blocks, warnings } = attempt(ctx, null, null);
  return { blocks, warnings, from: new Date(ctx.base.start).toISOString() };
}

/**
 * Re-plans from now, keeping what still works of the last plan (stickiness, M6): a previous
 * block stays if it's still free (no new overlap, its breaks kept), its task still needs that
 * much work, and it's before a hard due date. Everything else is placed in the time left. If
 * keeping blocks costs a deadline that a fresh plan meets, it keeps fewer (see
 * `ReplanFallback`).
 */
export function replan(input: ReplanInput): ReplanOutcome {
  const ctx = context(input);
  const pin = input.startNowTaskId ?? null;
  const repack = input.repackUntil?.getTime() ?? Number.NEGATIVE_INFINITY;
  const done = (a: Attempt, fallback: ReplanFallback): ReplanOutcome => ({
    blocks: a.blocks,
    warnings: a.warnings,
    from: new Date(ctx.base.start).toISOString(),
    fallback,
  });
  const sticky = attempt(ctx, chooseSticky(ctx, input.previous, repack), pin);
  if (sticky.missing === 0 && sticky.late === 0) return done(sticky, 'none');
  const fresh = attempt(ctx, null, pin);
  if (!worse(sticky, fresh)) return done(sticky, 'none');
  // Free the time up to the last due date in trouble; keep what comes after it.
  const troubled = sticky.warnings
    .filter((w) => w.kind !== 'spent')
    .map((w) => Date.parse(w.dueAt));
  const horizon = Math.max(Number.NEGATIVE_INFINITY, ...troubled);
  if (horizon > repack) {
    const partial = attempt(ctx, chooseSticky(ctx, input.previous, horizon), pin);
    if (!worse(partial, fresh)) return done(partial, 'partial');
  }
  return done(fresh, 'full');
}

const worse = (a: Attempt, b: Attempt) =>
  a.missing > b.missing || (a.missing === b.missing && a.late > b.late);

// One planning pass

interface Context {
  input: PlanInput;
  settings: PlanSettings;
  /** Fixed events and kept blocks. */
  base: Grid;
  say: Wording;
  /** The end slot of kept work that ended before the plan starts (it still earns its break). */
  workEndBefore: number;
}

function context(input: PlanInput): Context {
  const settings = { ...DEFAULT_PLAN_SETTINGS, ...input.settings };
  const start = Math.ceil(input.now.getTime() / SLOT_MS) * SLOT_MS;
  const size = Math.max(0, Math.floor((input.until.getTime() - start) / SLOT_MS));
  const base = Grid.create(start, size, input.timeZone);
  for (const f of input.fixed) {
    base.mark(Date.parse(f.startAt), Date.parse(f.endAt), isHard(f.kind) ? HARD : SOFT);
  }
  let workEndBefore = Number.NEGATIVE_INFINITY;
  for (const k of input.kept) {
    const end = Date.parse(k.endAt);
    if (k.mode === 'work' && end <= start) workEndBefore = Math.max(workEndBefore, base.ceil(end));
    if (k.mode === 'background') continue;
    base.mark(Date.parse(k.startAt), end, k.mode === 'work' ? WORK : BUSY);
  }
  return { input, settings, base, say: new Wording(input.timeZone), workEndBefore };
}

interface Attempt {
  blocks: PlannedBlock[];
  warnings: PlanWarning[];
  /** Slots of hard-deadline work that miss their due date. */
  missing: number;
  /** Slots of soft-deadline work after (or not before) their due date. */
  late: number;
}

/** Plans everything around what stays from the last plan (`sticky`, none for a fresh plan). */
function attempt(ctx: Context, sticky: Sticky | null, pinTaskId: string | null): Attempt {
  const { input, settings, say } = ctx;
  const grid = ctx.base.clone();
  const warnings: PlanWarning[] = [];
  const blocks: PlannedBlock[] = [];
  let missing = 0;
  let late = 0;
  const keptSequences = sticky?.sequences ?? new Map<string, KeptSequence>();
  const pre = sticky?.focus ?? [];
  // What stays from the last plan takes its time first.
  for (const kept of keptSequences.values()) {
    kept.segments.forEach((seg, i) => {
      const at = kept.positions[i] as number;
      if (seg.kind === 'step') grid.markSlots(at, at + seg.slots, BUSY);
    });
  }
  for (const c of pre) grid.markSlots(c.start, c.start + c.len, WORK);

  // 1. Sequences: tasks with steps, and background tasks.
  const sequences = input.tasks.filter(isSequence).sort(edfOrder);
  for (const task of sequences) {
    const kept = keptSequences.get(task.id);
    const placed = kept
      ? keptSequence(grid, task, kept, say)
      : placeSequence(grid, task, settings, say);
    if (placed.kind === 'none') {
      if (Date.parse(task.dueAt) <= input.until.getTime()) {
        warnings.push(unplacedWarning(task, say));
        const need = segmentsOf(task).reduce((sum, seg) => sum + seg.slots, 0);
        if (task.deadline === 'hard') missing += need;
        else late += need;
      }
      continue;
    }
    blocks.push(...placed.blocks);
    if (placed.kind === 'late') {
      warnings.push(lateWarning(task, placed.endMs, 0, say));
      late += Math.max(0, Math.ceil((placed.endMs - Date.parse(task.dueAt)) / SLOT_MS));
    }
  }

  // 2. Focus and light work, with fallbacks when something misses its due date.
  const focusTasks = input.tasks.filter(isFocus);
  const all = { interleave: settings.interleave, oneSitting: true, running: true };
  const none = { interleave: false, oneSitting: false, running: false };
  const variants: Variant[] = [
    { ...all, softYield: false },
    { ...all, interleave: false, softYield: false },
    { ...none, softYield: false },
    { ...all, softYield: true },
    { ...none, softYield: true },
  ];
  let best: FocusResult | null = null;
  for (const variant of variants) {
    const result = placeFocus(ctx, grid.clone(), focusTasks, variant, pre, pinTaskId);
    if (
      !best ||
      result.missing < best.missing ||
      (result.missing === best.missing && result.late < best.late)
    ) {
      best = result;
    }
    if (best.missing === 0 && best.late === 0) break;
  }
  if (best) {
    blocks.push(...focusBlocks(best, say));
    warnings.push(...focusWarnings(best, input, say));
    missing += best.missing;
    late += best.late;
  }

  blocks.sort((a, b) => a.startAt.localeCompare(b.startAt) || kindRank(a) - kindRank(b));
  return { blocks, warnings, missing, late };
}

const isHard = (kind: FixedEventKind) => kind === 'sleep' || kind === 'class' || kind === 'other';
const kindRank = (b: PlannedBlock) => (b.kind === 'wait' ? 1 : 0);
/** Planned as a sequence: steps with waits, or a background task's one block. */
const isSequence = (t: PlanTask) => t.steps.length > 0 || (t.background && t.remainingMin > 0);
const isFocus = (t: PlanTask) => t.steps.length === 0 && !t.background && t.remainingMin > 0;

function edfOrder(a: PlanTask, b: PlanTask): number {
  if (a.dueAt !== b.dueAt) return a.dueAt < b.dueAt ? -1 : 1;
  return (
    PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
    a.createdAt.localeCompare(b.createdAt) ||
    a.id.localeCompare(b.id)
  );
}

// Sequences (steps and background tasks)

interface Segment {
  kind: BlockKind;
  slots: number;
  title: string;
}

interface Fit {
  positions: number[];
  end: number;
  cost: number;
}

type SequencePlacement =
  | { kind: 'none' }
  | { kind: 'on-time' | 'late'; blocks: PlannedBlock[]; endMs: number };

function segmentsOf(task: PlanTask): Segment[] {
  if (task.steps.length === 0) {
    return [{ kind: 'work', slots: slots(task.remainingMin), title: '' }];
  }
  return task.steps.map((s) => ({
    kind: s.wait ? 'wait' : 'step',
    slots: slots(s.minutes),
    title: s.title,
  }));
}

/**
 * Tries to start the sequence at slot `s`: waits and background work may overlap anything but
 * sleep, classes and other commitments; a hands-on step needs free time and may start up to the
 * tolerance after the wait before it ends. The cost counts free slots right beside each step
 * (a step next to a meal or class splits free time less).
 */
function fitAt(grid: Grid, s: number, segments: Segment[], tolerance: number): Fit | null {
  let cur = s;
  let cost = 0;
  const positions: number[] = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i] as Segment;
    if (seg.kind !== 'step') {
      if (cur + seg.slots > grid.size || grid.hasFlag(cur, cur + seg.slots, HARD)) return null;
      positions.push(cur);
      cur += seg.slots;
      continue;
    }
    const window = i > 0 && segments[i - 1]?.kind === 'wait' ? tolerance : 0;
    let at = -1;
    for (let p = cur; p <= cur + window; p++) {
      if (grid.isFree(p, p + seg.slots)) {
        at = p;
        break;
      }
    }
    if (at < 0) return null;
    if (at > 0 && grid.flags[at - 1] === 0) cost++;
    if (at + seg.slots < grid.size && grid.flags[at + seg.slots] === 0) cost++;
    positions.push(at);
    cur = at + seg.slots;
  }
  return { positions, end: cur, cost };
}

function placeSequence(
  grid: Grid,
  task: PlanTask,
  settings: PlanSettings,
  say: Wording,
): SequencePlacement {
  const segments = segmentsOf(task);
  const release = task.earliestStartAt
    ? Math.max(0, grid.ceil(Date.parse(task.earliestStartAt)))
    : 0;
  const dueSlot = grid.floor(Date.parse(task.dueAt));
  const tolerance = slots(settings.stepToleranceMin);
  /** The best start on the first day that has one: least cost, then earliest. */
  const search = (limit: number): Fit | null => {
    let best: Fit | null = null;
    let bestDay = -1;
    for (let s = release; s < grid.size; s++) {
      if (best && grid.day[s] !== bestDay) break;
      const fit = fitAt(grid, s, segments, tolerance);
      if (!fit || fit.end > limit) continue;
      if (!best || fit.cost < best.cost) {
        best = fit;
        bestDay = grid.day[s] ?? -1;
      }
    }
    return best;
  };
  let fit = search(dueSlot);
  let late = false;
  if (!fit && task.deadline === 'soft') {
    fit = search(Number.POSITIVE_INFINITY);
    late = fit !== null;
  }
  if (!fit) return { kind: 'none' };
  segments.forEach((seg, i) => {
    const at = fit.positions[i] as number;
    if (seg.kind === 'step') grid.markSlots(at, at + seg.slots, BUSY);
  });
  return {
    kind: late ? 'late' : 'on-time',
    blocks: sequenceBlocks(grid, task, segments, fit.positions, { late, say }),
    endMs: grid.time(fit.end),
  };
}

/** A sequence kept from the last plan (its steps are already marked). */
function keptSequence(
  grid: Grid,
  task: PlanTask,
  kept: KeptSequence,
  say: Wording,
): SequencePlacement {
  const endMs = grid.time(kept.end);
  const late = endMs > Date.parse(task.dueAt);
  const blocks = sequenceBlocks(grid, task, kept.segments, kept.positions, {
    late,
    say,
    previousIds: kept.previousIds,
  });
  return { kind: late ? 'late' : 'on-time', blocks, endMs };
}

function sequenceBlocks(
  grid: Grid,
  task: PlanTask,
  segments: Segment[],
  positions: number[],
  ctx: { late: boolean; say: Wording; previousIds?: string[] },
): PlannedBlock[] {
  const handsOn = segments.filter((s) => s.kind === 'step').length;
  let stepNumber = 0;
  return segments.map((seg, i) => {
    const at = positions[i] as number;
    if (seg.kind === 'step') stepNumber++;
    const prev = segments[i - 1];
    const previousId = ctx.previousIds?.[i];
    return {
      taskId: task.id,
      title: seg.kind === 'work' ? '' : `${task.title}: ${seg.title || 'waiting'}`,
      startAt: new Date(grid.time(at)).toISOString(),
      endAt: new Date(grid.time(at + seg.slots)).toISOString(),
      kind: seg.kind,
      reason: ctx.say.sequenceReason(task, seg, {
        stepNumber,
        handsOn,
        afterWait: prev?.kind === 'wait' ? prev.slots * SLOT_MIN : null,
        late: ctx.late,
        kept: previousId !== undefined,
      }),
      ...(previousId !== undefined && { previousId }),
    };
  });
}

// Stickiness (M6): what a re-plan keeps of the last plan

/** A focus block kept from the last plan, maybe shortened. */
interface PreChunk {
  taskId: string;
  previousId: string;
  start: number;
  len: number;
}

/** A sequence kept whole, exactly where it was. */
interface KeptSequence {
  segments: Segment[];
  positions: number[];
  previousIds: string[];
  end: number;
}

interface Sticky {
  sequences: Map<string, KeptSequence>;
  focus: PreChunk[];
}

/**
 * The previous blocks that can stay where they are, given what has changed: each must start at
 * or after `releaseBefore` (earlier ones are planned again), sit on free time with its breaks,
 * respect its task's earliest start and hard due date, and fit its task's work left. A sequence
 * stays only whole and unchanged. A task keeps its focus blocks in time order up to its work
 * left (the last one may be shortened), never leaving less than a minimum chunk to plan anew.
 */
function chooseSticky(
  ctx: Context,
  previous: readonly PreviousBlock[],
  releaseBefore: number,
): Sticky {
  const { input, settings } = ctx;
  const grid = ctx.base.clone();
  const tasks = new Map(input.tasks.map((t) => [t.id, t]));
  const brk = slots(settings.breakMin);
  const from = Math.max(grid.start, releaseBefore);
  const end = grid.time(grid.size);
  const slotsOf = (b: PreviousBlock): [number, number] | null => {
    const s = Date.parse(b.startAt);
    const e = Date.parse(b.endAt);
    if (s < from || e > end || e <= s) return null;
    if ((s - grid.start) % SLOT_MS !== 0 || (e - grid.start) % SLOT_MS !== 0) return null;
    return [grid.floor(s), grid.floor(e)];
  };
  const release = (t: PlanTask) =>
    t.earliestStartAt ? grid.ceil(Date.parse(t.earliestStartAt)) : Number.NEGATIVE_INFINITY;
  const due = (t: PlanTask) => grid.floor(Date.parse(t.dueAt));
  const byTask = new Map<string, PreviousBlock[]>();
  for (const b of [...previous].sort(byStart)) {
    byTask.set(b.taskId, [...(byTask.get(b.taskId) ?? []), b]);
  }

  const sequences = new Map<string, KeptSequence>();
  for (const task of input.tasks.filter(isSequence).sort(edfOrder)) {
    const prev = byTask.get(task.id);
    const segments = segmentsOf(task);
    if (!prev || prev.length !== segments.length) continue;
    const spans = prev.map(slotsOf);
    const same = spans.every((span, i) => {
      const seg = segments[i] as Segment;
      return span !== null && prev[i]?.kind === seg.kind && span[1] - span[0] === seg.slots;
    });
    const first = spans[0]?.[0];
    if (!same || first === undefined || first < release(task)) continue;
    const fit = fitAt(grid, first, segments, slots(settings.stepToleranceMin));
    if (!fit || fit.positions.some((p, i) => p !== spans[i]?.[0])) continue;
    if (task.deadline === 'hard' && fit.end > due(task)) continue;
    segments.forEach((seg, i) => {
      const at = fit.positions[i] as number;
      if (seg.kind === 'step') grid.markSlots(at, at + seg.slots, BUSY);
    });
    sequences.set(task.id, {
      segments,
      positions: fit.positions,
      previousIds: prev.map((b) => b.id),
      end: fit.end,
    });
  }

  const valid = new Map<string, PreChunk[]>();
  for (const b of [...previous].sort(byStart)) {
    const task = tasks.get(b.taskId);
    const span = slotsOf(b);
    if (!task || !isFocus(task) || b.kind !== 'work' || !span) continue;
    const [s, e] = span;
    const len = e - s;
    const minLen = Math.max(1, slots(task.minChunkMin));
    const maxLen = Math.max(slots(settings.maxChunkMin), minLen);
    const sized =
      len >= Math.min(minLen, slots(task.remainingMin)) &&
      (!task.splittable || len <= maxLen || len < 2 * minLen);
    if (!sized || s < release(task) || (task.deadline === 'hard' && e > due(task))) continue;
    if (!grid.isFree(s, e) || s < ctx.workEndBefore + brk) continue;
    if (grid.hasFlag(s - brk, s, WORK) || grid.hasFlag(e, e + brk, WORK)) continue;
    grid.markSlots(s, e, WORK);
    valid.set(task.id, [
      ...(valid.get(task.id) ?? []),
      { taskId: task.id, previousId: b.id, start: s, len },
    ]);
  }
  const focus: PreChunk[] = [];
  for (const [taskId, chunks] of valid)
    focus.push(...consume(tasks.get(taskId) as PlanTask, chunks));
  return { sequences, focus: focus.sort((a, b) => a.start - b.start) };
}

/** The prefix of a task's valid blocks that its work left covers, in time order. */
function consume(task: PlanTask, chunks: PreChunk[]): PreChunk[] {
  const total = slots(task.remainingMin);
  const first = chunks[0];
  if (!task.splittable) return first && first.len >= total ? [{ ...first, len: total }] : [];
  const minLen = Math.min(Math.max(1, slots(task.minChunkMin)), total);
  const out: PreChunk[] = [];
  let used = 0;
  for (const c of chunks) {
    if (used + c.len <= total) {
      out.push(c);
      used += c.len;
      continue;
    }
    if (total - used >= minLen) {
      out.push({ ...c, len: total - used });
      used = total;
    }
    break;
  }
  // What's left to plan anew must make a chunk of the minimum: shorten the last block kept for
  // it, or give that block up too.
  while (out.length > 0 && total - used > 0 && total - used < minLen) {
    const last = out.at(-1) as PreChunk;
    const need = minLen - (total - used);
    if (last.len - need >= minLen) {
      out[out.length - 1] = { ...last, len: last.len - need };
      used -= need;
    } else {
      out.pop();
      used -= last.len;
    }
  }
  return out;
}

const byStart = (a: PreviousBlock, b: PreviousBlock) =>
  a.startAt.localeCompare(b.startAt) || a.id.localeCompare(b.id);

// Focus and light work

interface Variant {
  interleave: boolean;
  oneSitting: boolean;
  running: boolean;
  /** Soft deadlines go after every hard one. */
  softYield: boolean;
}

type Why =
  | 'running'
  | 'one-sitting'
  | 'switch'
  | 'urgent'
  | 'fits'
  | 'late'
  | 'kept'
  | 'late-start';

interface Job {
  task: PlanTask;
  /** Slots left to place. */
  rem: number;
  release: number;
  /** The due date's slot boundary (negative when it has passed). */
  due: number;
  minLen: number;
  maxLen: number;
  rank: number;
}

interface Chunk {
  job: Job;
  start: number;
  len: number;
  why: Why;
  /** Free minutes to spare before the due date when it was placed. */
  spareMin: number;
  /** A soft deadline placed after hard ones (the soft-yield fallback). */
  yielded: boolean;
  /** Kept from the last plan (re-planning). */
  previousId?: string;
}

interface FocusResult {
  grid: Grid;
  jobs: Job[];
  chunks: Chunk[];
  /** Slots of hard-deadline work that miss their due date (the fewest wins). */
  missing: number;
  /** Slots of soft-deadline work planned after (or not before) their due date (then fewest). */
  late: number;
}

/**
 * Focus work forward in time from slot 0. `pre` are blocks kept from the last plan (already
 * marked on the grid); `pinTaskId`'s work takes the first free time it fits, cut to fit there.
 */
function placeFocus(
  ctx: Context,
  grid: Grid,
  tasks: readonly PlanTask[],
  variant: Variant,
  pre: readonly PreChunk[],
  pinTaskId: string | null,
): FocusResult {
  const { input, settings } = ctx;
  const brk = slots(settings.breakMin);
  const preSlots = new Map<string, number>();
  for (const c of pre) preSlots.set(c.taskId, (preSlots.get(c.taskId) ?? 0) + c.len);
  const order = variant.softYield
    ? (a: PlanTask, b: PlanTask) =>
        Number(a.deadline === 'soft') - Number(b.deadline === 'soft') || edfOrder(a, b)
    : edfOrder;
  const jobs: Job[] = [...tasks].sort(order).map((task, rank) => {
    const minLen = Math.max(1, slots(task.minChunkMin));
    return {
      task,
      rem: slots(task.remainingMin) - (preSlots.get(task.id) ?? 0),
      release: task.earliestStartAt ? Math.max(0, grid.ceil(Date.parse(task.earliestStartAt))) : 0,
      due: grid.floor(Date.parse(task.dueAt)),
      minLen,
      maxLen: Math.max(slots(settings.maxChunkMin), minLen),
      rank,
    };
  });
  // Everything at or after the cursor is untouched while placing, so these stay true ahead.
  const freePrefix = grid.freePrefix();
  const runs = grid.runs();
  const freeBetween = (a: number, b: number) => {
    const lo = Math.max(0, Math.min(grid.size, a));
    const hi = Math.max(lo, Math.min(grid.size, b));
    return (freePrefix[hi] ?? 0) - (freePrefix[lo] ?? 0);
  };
  const keepsDue = (j: Job) => j.task.deadline === 'hard';

  /**
   * Whether the free time after slot `after` is too little (with a margin for breaks and short
   * gaps) for everything due by `job`'s due date. Work due after the plan's end isn't tight:
   * next week's plan has time for it too.
   */
  const tight = (job: Job, after: number) => {
    if (job.due > grid.size) return false;
    return freeBetween(after, job.due) * EFFICIENCY < demandBy(job.due, null);
  };

  /**
   * How long a chunk of `job` at `t` can be with `avail` slots of room; 0 if none fits. Work
   * that fits in one block isn't cut up to fill a short gap unless its deadline is tight (or
   * `cut` says to).
   */
  const chunkFor = (job: Job, t: number, avail: number, runEnd: number, cut = false): number => {
    if (job.rem <= 0 || job.release > t) return 0;
    // Work stops at the due date; only a soft deadline's work goes on once it has passed.
    const room = keepsDue(job) || t < job.due ? Math.min(avail, job.due - t) : avail;
    if (room <= 0) return 0;
    if (!job.task.splittable) return job.rem <= room ? job.rem : 0;
    if (job.rem <= Math.min(room, job.maxLen)) return job.rem;
    if (job.rem <= job.maxLen && !cut && !tight(job, runEnd)) return 0;
    // Too little to make two chunks of the minimum: one block, a little over the maximum.
    if (job.rem < 2 * job.minLen) return job.rem <= room ? job.rem : 0;
    let len = Math.min(room, job.maxLen);
    if (job.rem - len < job.minLen) len = job.rem - job.minLen;
    return len >= job.minLen ? len : 0;
  };

  /** Work due at or before `due`, minus `except`. */
  const demandBy = (due: number, except: Job | null) => {
    let sum = 0;
    for (const j of jobs) if (j !== except && j.rem > 0 && j.due <= due) sum += j.rem;
    return sum;
  };

  /** Whether everything due before `alt` still fits if `alt` takes the time up to `from`. */
  const safeToDefer = (alt: Job, from: number) => {
    for (const k of jobs) {
      if (k === alt || k.rem <= 0 || k.due >= alt.due) continue;
      if (freeBetween(from, k.due) * EFFICIENCY < demandBy(k.due, alt)) return false;
    }
    return true;
  };

  /** Whether a one-sitting job has another gap long enough after slot `after`. */
  const laterRoom = (job: Job, after: number) => {
    const limit = keepsDue(job) ? job.due : grid.size;
    for (const [a, b] of runs) {
      const s = Math.max(a, after, job.release);
      if (Math.min(b, limit) - s >= job.rem) return true;
    }
    return false;
  };

  const chunks: Chunk[] = [];
  // Blocks kept from the last plan, by start slot: the scan passes over them.
  const keptAt = new Map<number, Chunk>();
  const jobOf = new Map(jobs.map((j) => [j.task.id, j]));
  for (const c of pre) {
    const job = jobOf.get(c.taskId);
    if (!job) continue;
    const chunk: Chunk = {
      job,
      start: c.start,
      len: c.len,
      why: c.start + c.len > job.due ? 'late' : 'kept',
      spareMin: (freeBetween(c.start, job.due) - demandBy(job.due, null)) * SLOT_MIN,
      yielded: false,
      previousId: c.previousId,
    };
    chunks.push(chunk);
    keptAt.set(c.start, chunk);
  }
  let placed = 0;
  let lastSubject: string | null = null;
  // Kept work that ended just before the plan starts still earns its break.
  let lastWorkEnd = ctx.workEndBefore;
  const runningId = variant.running ? (input.runningTaskId ?? null) : null;
  // The late-started task goes with the running-task preference (and its fallbacks).
  const pinJob = variant.running && pinTaskId ? (jobOf.get(pinTaskId) ?? null) : null;
  let pinDone = false;

  const choose = (t: number, avail: number, runEnd: number) => {
    const candidates: { job: Job; len: number }[] = [];
    for (const job of jobs) {
      const len = chunkFor(job, t, avail, runEnd);
      if (len > 0) candidates.push({ job, len });
    }
    if (placed === 0 && runningId) {
      const running = candidates.find((c) => c.job.task.id === runningId);
      if (running) return { ...running, why: 'running' as Why };
    }
    if (pinJob && !pinDone) {
      const len = chunkFor(pinJob, t, avail, runEnd, true);
      if (len > 0) return { job: pinJob, len, why: 'late-start' as Why };
    }
    const first = candidates[0];
    if (!first) return null;
    if (variant.oneSitting) {
      const must = candidates.find((c) => !c.job.task.splittable && !laterRoom(c.job, runEnd));
      if (must) return { ...must, why: 'one-sitting' as Why };
    }
    if (variant.interleave && lastSubject !== null && first.job.task.subject === lastSubject) {
      const alt = candidates.find(
        (c) => c.job.task.subject !== lastSubject && safeToDefer(c.job, t + c.len + brk),
      );
      if (alt) return { ...alt, why: 'switch' as Why };
    }
    const job = first.job;
    let why: Why;
    if (t + first.len > job.due) why = 'late';
    else if (jobs.some((j) => j.rank < job.rank && j.rem > 0 && j.release <= t)) why = 'fits';
    else why = 'urgent';
    return { ...first, why };
  };

  let t = 0;
  while (t < grid.size) {
    const flag = grid.flags[t] ?? 0;
    if (flag !== 0) {
      if (flag & WORK) lastWorkEnd = t + 1;
      const kept = keptAt.get(t);
      if (kept) lastSubject = kept.job.task.subject;
      t++;
      continue;
    }
    let runEnd = t;
    while (runEnd < grid.size && grid.flags[runEnd] === 0) runEnd++;
    const begin = Math.max(t, lastWorkEnd + brk);
    // Leave a break before work that starts soon after this gap (even behind a class).
    let end = runEnd;
    for (let k = runEnd; k < Math.min(grid.size, runEnd + brk); k++) {
      if ((grid.flags[k] ?? 0) & WORK) {
        end = Math.min(runEnd, k - brk);
        break;
      }
    }
    if (begin >= end) {
      t = runEnd;
      continue;
    }
    t = begin;
    const pick = choose(t, end - t, runEnd);
    if (!pick) {
      // Nothing fits here; something released later in this gap might.
      let next = runEnd;
      for (const j of jobs) if (j.rem > 0 && j.release > t && j.release < next) next = j.release;
      t = next;
      continue;
    }
    const { job, len, why } = pick;
    const spareMin = (freeBetween(t, job.due) - demandBy(job.due, null)) * SLOT_MIN;
    const yielded = variant.softYield && job.task.deadline === 'soft';
    grid.markSlots(t, t + len, WORK);
    chunks.push({ job, start: t, len, why, spareMin, yielded });
    placed++;
    if (job === pinJob) pinDone = true;
    job.rem -= len;
    lastSubject = job.task.subject;
    lastWorkEnd = t + len;
    t += len;
  }

  chunks.sort((a, b) => a.start - b.start);
  const untilSlot = grid.floor(input.until.getTime());
  let missing = 0;
  let late = 0;
  for (const j of jobs) {
    if (j.rem > 0 && j.due <= untilSlot) {
      if (keepsDue(j)) missing += j.rem;
      else late += j.rem;
    }
  }
  for (const c of chunks) late += Math.max(0, c.start + c.len - Math.max(c.start, c.job.due));
  return { grid, jobs, chunks, missing, late };
}

function focusBlocks(result: FocusResult, say: Wording): PlannedBlock[] {
  const parts = new Map<Job, number>();
  for (const c of result.chunks) parts.set(c.job, (parts.get(c.job) ?? 0) + 1);
  const seen = new Map<Job, number>();
  return result.chunks.map((c) => {
    const part = (seen.get(c.job) ?? 0) + 1;
    seen.set(c.job, part);
    return {
      taskId: c.job.task.id,
      title: '',
      startAt: new Date(result.grid.time(c.start)).toISOString(),
      endAt: new Date(result.grid.time(c.start + c.len)).toISOString(),
      kind: 'work' as const,
      reason: say.chunkReason(c, part, parts.get(c.job) ?? 1),
      ...(c.previousId !== undefined && { previousId: c.previousId }),
    };
  });
}

function focusWarnings(result: FocusResult, input: PlanInput, say: Wording): PlanWarning[] {
  const warnings: PlanWarning[] = [];
  const nowMs = input.now.getTime();
  const untilMs = input.until.getTime();
  for (const job of result.jobs) {
    const { task } = job;
    const dueMs = Date.parse(task.dueAt);
    const minutes = job.rem * SLOT_MIN;
    if (task.deadline === 'soft') {
      const last = result.chunks.filter((c) => c.job === job).at(-1);
      const endMs = last ? result.grid.time(last.start + last.len) : null;
      const unplanned = dueMs <= untilMs ? minutes : 0;
      if (unplanned > 0 || (endMs !== null && endMs > dueMs)) {
        warnings.push(lateWarning(task, endMs, unplanned, say));
      }
      continue;
    }
    if (job.rem <= 0 || dueMs > untilMs) continue;
    const options: PlanOption[] = ['make-soft'];
    if (!task.splittable) options.push('allow-split');
    options.push('edit-task');
    warnings.push(
      dueMs <= nowMs
        ? {
            kind: 'overdue',
            taskId: task.id,
            title: task.title,
            dueAt: task.dueAt,
            minutes,
            message: `${task.title} was due ${say.when(dueMs)} and has ${formatMinutes(minutes)} of work left.`,
            options: ['make-soft', 'edit-task'],
          }
        : {
            kind: 'short',
            taskId: task.id,
            title: task.title,
            dueAt: task.dueAt,
            minutes,
            message: `${formatMinutes(minutes)} of ${task.title} doesn't fit before it's due ${say.when(dueMs)}.${
              task.splittable ? '' : ' It needs one sitting, and no gap before then is long enough.'
            }`,
            options,
          },
    );
  }
  return warnings;
}

function unplacedWarning(task: PlanTask, say: Wording): PlanWarning {
  const what = task.steps.length > 0 ? 'Its steps don’t' : 'It doesn’t';
  const minutes = task.steps.length > 0 ? sumMinutes(task.steps) : task.remainingMin;
  const when =
    task.deadline === 'soft' ? 'this week' : `before it's due ${say.when(Date.parse(task.dueAt))}`;
  return {
    kind: 'unplaced',
    taskId: task.id,
    title: task.title,
    dueAt: task.dueAt,
    minutes,
    message: `${task.title} isn't planned. ${what} fit ${when}: waits can't overlap sleep, classes or other commitments, and each hands-on step needs free time.`,
    options: task.deadline === 'hard' ? ['make-soft', 'edit-task'] : ['edit-task'],
  };
}

/** A soft deadline the plan doesn't meet: finished after it, or with work left this week. */
function lateWarning(
  task: PlanTask,
  endMs: number | null,
  unplannedMin: number,
  say: Wording,
): PlanWarning {
  const dueMs = Date.parse(task.dueAt);
  const soft = `its soft deadline, ${say.when(dueMs)}`;
  const message =
    unplannedMin > 0
      ? `${formatMinutes(unplannedMin)} of ${task.title} isn't planned this week, past ${soft}.`
      : `${task.title} is planned to finish ${say.when(endMs ?? dueMs)}, after ${soft}.`;
  return {
    kind: 'late',
    taskId: task.id,
    title: task.title,
    dueAt: task.dueAt,
    minutes:
      unplannedMin > 0
        ? unplannedMin
        : Math.max(0, Math.round(((endMs ?? dueMs) - dueMs) / 60_000)),
    message,
    options: ['edit-task'],
  };
}

const sumMinutes = (steps: readonly TaskStep[]) => steps.reduce((sum, s) => sum + s.minutes, 0);

/** Reasons and messages, with times in the display zone. */
class Wording {
  private readonly format: Intl.DateTimeFormat;

  constructor(timeZone: string) {
    this.format = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  /** "Tue, Oct 6, 11:59 PM". */
  when(ms: number): string {
    return this.format.format(ms);
  }

  /** "Due Tue, Oct 6, 11:59 PM", or "Soft deadline Tue, …". */
  due(task: PlanTask): string {
    const when = this.when(Date.parse(task.dueAt));
    return task.deadline === 'soft' ? `Soft deadline ${when}` : `Due ${when}`;
  }

  chunkReason(c: Chunk, part: number, parts: number): string {
    const { task } = c.job;
    const out: string[] = [];
    if (parts > 1) out.push(`Part ${part} of ${parts}.`);
    const due = this.due(task);
    if (c.why === 'late') out.push(`${due}: planned after it, as a soft deadline allows.`);
    else if (c.spareMin > 0) {
      out.push(`${due}, with ${formatMinutes(c.spareMin)} of free time to spare.`);
    } else out.push(`${due}, and time is tight.`);
    if (c.yielded) out.push('Hard deadlines come first this week.');
    switch (c.why) {
      case 'running':
        out.push("You're working on it now.");
        break;
      case 'one-sitting':
        out.push(
          `It needs ${formatMinutes(c.len * SLOT_MIN)} in one sitting, and no later gap before it's due is long enough.`,
        );
        break;
      case 'switch':
        out.push('A change of subject; everything due sooner still fits.');
        break;
      case 'urgent':
        out.push('The earliest deadline among open work.');
        break;
      case 'fits':
        out.push('The most urgent work that fits this gap.');
        break;
      case 'kept':
        out.push('Kept where it was planned.');
        break;
      case 'late-start':
        out.push('The first free time after a late start.');
        break;
      case 'late':
        break;
    }
    if (!task.splittable && c.why !== 'one-sitting') out.push('One sitting, as set on the task.');
    if (!task.estimated) out.push("No estimate yet, so it's planned for the default length.");
    return out.join(' ');
  }

  sequenceReason(
    task: PlanTask,
    seg: Segment,
    ctx: {
      stepNumber: number;
      handsOn: number;
      afterWait: number | null;
      late: boolean;
      kept: boolean;
    },
  ): string {
    const out: string[] = [];
    if (seg.kind === 'wait') {
      out.push(`Waiting ${formatMinutes(seg.slots * SLOT_MIN)}; other work can go on meanwhile.`);
    } else if (seg.kind === 'step') {
      out.push(
        ctx.afterWait !== null
          ? `Hands-on step ${ctx.stepNumber} of ${ctx.handsOn}, after the ${formatMinutes(ctx.afterWait)} wait.`
          : `Hands-on step ${ctx.stepNumber} of ${ctx.handsOn}.`,
      );
    } else {
      out.push('Background task: it runs alongside other work.');
    }
    const due = this.due(task);
    out.push(ctx.late ? `${due}: planned after it, as a soft deadline allows.` : `${due}.`);
    if (ctx.kept) out.push('Kept where it was planned.');
    else if (seg.kind !== 'wait') {
      out.push('The first day it fits, where it splits free time least.');
    }
    return out.join(' ');
  }
}
