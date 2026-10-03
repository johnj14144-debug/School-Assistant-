import type { BlockKind, FixedEventKind } from '../calendar/schemas';
import { formatMinutes } from '../tasks/duration';
import type { TaskPriority } from '../tasks/schemas';
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
 * 3. If anything misses its due date, the plan is redone without interleaving (and then
 *    without the one-sitting and keep-going-on-the-running-task preferences); the plan with
 *    the least work missing wins. What still doesn't fit becomes a warning with options.
 *
 * Every block carries a "why here" reason.
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
  dueAt: string | null;
  earliestStartAt: string | null;
  splittable: boolean;
  minChunkMin: number;
  allowLate: boolean;
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
}

export interface PlanOutcome {
  /** In time order. */
  blocks: PlannedBlock[];
  warnings: PlanWarning[];
  /** UTC ISO instant of slot 0 (now, rounded up to 5 minutes). */
  from: string;
}

/** Share of free time that becomes work once breaks and short gaps are paid for. */
const EFFICIENCY = 0.75;
const PRIORITY_RANK: Record<TaskPriority, number> = { high: 0, normal: 1, low: 2 };

const slots = (minutes: number) => Math.ceil(minutes / SLOT_MIN);

export function planWeek(input: PlanInput): PlanOutcome {
  const settings = { ...DEFAULT_PLAN_SETTINGS, ...input.settings };
  const start = Math.ceil(input.now.getTime() / SLOT_MS) * SLOT_MS;
  const size = Math.max(0, Math.floor((input.until.getTime() - start) / SLOT_MS));
  const grid = Grid.create(start, size, input.timeZone);
  for (const f of input.fixed) {
    grid.mark(Date.parse(f.startAt), Date.parse(f.endAt), isHard(f.kind) ? HARD : SOFT);
  }
  for (const k of input.kept) {
    if (k.mode === 'background') continue;
    grid.mark(Date.parse(k.startAt), Date.parse(k.endAt), k.mode === 'work' ? WORK : BUSY);
  }
  const say = new Wording(input.timeZone);
  const warnings: PlanWarning[] = [];
  const blocks: PlannedBlock[] = [];

  // 1. Sequences: tasks with steps, and background tasks.
  const sequences = input.tasks
    .filter((t) => t.steps.length > 0 || (t.background && t.remainingMin > 0))
    .sort(edfOrder);
  for (const task of sequences) {
    const placed = placeSequence(grid, task, settings, say);
    if (placed.kind === 'none') {
      const dueMs = task.dueAt ? Date.parse(task.dueAt) : null;
      if (dueMs === null || dueMs <= input.until.getTime()) {
        warnings.push(unplacedWarning(task, say));
      }
      continue;
    }
    blocks.push(...placed.blocks);
    if (placed.kind === 'late') warnings.push(lateWarning(task, placed.endMs, say));
  }

  // 2. Focus and light work, with fallbacks when something misses its due date.
  const focusTasks = input.tasks.filter(
    (t) => t.steps.length === 0 && !t.background && t.remainingMin > 0,
  );
  const variants: Variant[] = [
    { interleave: settings.interleave, oneSitting: true, running: true },
    { interleave: false, oneSitting: true, running: true },
    { interleave: false, oneSitting: false, running: false },
  ];
  let best: FocusResult | null = null;
  for (const variant of variants) {
    const result = placeFocus(grid.clone(), focusTasks, input, settings, variant);
    if (!best || result.missing < best.missing) best = result;
    if (best.missing === 0) break;
  }
  if (best) {
    blocks.push(...focusBlocks(best, say));
    warnings.push(...focusWarnings(best, input, say));
  }

  blocks.sort((a, b) => a.startAt.localeCompare(b.startAt) || kindRank(a) - kindRank(b));
  return { blocks, warnings, from: new Date(start).toISOString() };
}

const isHard = (kind: FixedEventKind) => kind === 'sleep' || kind === 'class' || kind === 'other';
const kindRank = (b: PlannedBlock) => (b.kind === 'wait' ? 1 : 0);

function edfOrder(a: PlanTask, b: PlanTask): number {
  if (a.dueAt !== b.dueAt) {
    if (a.dueAt === null) return 1;
    if (b.dueAt === null) return -1;
    return a.dueAt < b.dueAt ? -1 : 1;
  }
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
  const dueSlot = task.dueAt ? grid.floor(Date.parse(task.dueAt)) : null;
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
  let fit = search(dueSlot ?? Number.POSITIVE_INFINITY);
  let late = false;
  if (!fit && dueSlot !== null && task.allowLate) {
    fit = search(Number.POSITIVE_INFINITY);
    late = fit !== null;
  }
  if (!fit) return { kind: 'none' };

  const blocks: PlannedBlock[] = [];
  const handsOn = segments.filter((s) => s.kind === 'step').length;
  let stepNumber = 0;
  segments.forEach((seg, i) => {
    const at = fit.positions[i] as number;
    if (seg.kind === 'step') grid.markSlots(at, at + seg.slots, BUSY);
    if (seg.kind === 'step') stepNumber++;
    const startMs = grid.time(at);
    const prev = segments[i - 1];
    blocks.push({
      taskId: task.id,
      title: seg.kind === 'work' ? '' : `${task.title}: ${seg.title || 'waiting'}`,
      startAt: new Date(startMs).toISOString(),
      endAt: new Date(grid.time(at + seg.slots)).toISOString(),
      kind: seg.kind,
      reason: say.sequenceReason(task, seg, {
        stepNumber,
        handsOn,
        afterWait: prev?.kind === 'wait' ? prev.slots * SLOT_MIN : null,
        late,
      }),
    });
  });
  return { kind: late ? 'late' : 'on-time', blocks, endMs: grid.time(fit.end) };
}

// Focus and light work

interface Variant {
  interleave: boolean;
  oneSitting: boolean;
  running: boolean;
}

type Why = 'running' | 'one-sitting' | 'switch' | 'urgent' | 'fits' | 'late' | 'undated';

interface Job {
  task: PlanTask;
  /** Slots left to place. */
  rem: number;
  release: number;
  /** Work must end at or before this slot boundary; null: no due date. */
  due: number | null;
  minLen: number;
  maxLen: number;
  rank: number;
}

interface Chunk {
  job: Job;
  start: number;
  len: number;
  why: Why;
  /** Free minutes to spare before the due date when it was placed (dated tasks). */
  spareMin: number | null;
}

interface FocusResult {
  grid: Grid;
  jobs: Job[];
  chunks: Chunk[];
  /** Slots of work that miss their due date (the variant with the fewest wins). */
  missing: number;
}

function placeFocus(
  grid: Grid,
  tasks: readonly PlanTask[],
  input: PlanInput,
  settings: PlanSettings,
  variant: Variant,
): FocusResult {
  const brk = slots(settings.breakMin);
  const jobs: Job[] = [...tasks].sort(edfOrder).map((task, rank) => {
    const minLen = Math.max(1, slots(task.minChunkMin));
    return {
      task,
      rem: slots(task.remainingMin),
      release: task.earliestStartAt ? Math.max(0, grid.ceil(Date.parse(task.earliestStartAt))) : 0,
      due: task.dueAt ? grid.floor(Date.parse(task.dueAt)) : null,
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
  const keepsDue = (j: Job) => j.due !== null && !j.task.allowLate;

  /**
   * Whether the free time after slot `after` is too little (with a margin for breaks and short
   * gaps) for everything due by `job`'s due date. Work due after the plan's end isn't tight:
   * next week's plan has time for it too.
   */
  const tight = (job: Job, after: number) => {
    if (job.due === null || job.due > grid.size) return false;
    return freeBetween(after, job.due) * EFFICIENCY < demandBy(job.due, null);
  };

  /**
   * How long a chunk of `job` at `t` can be with `avail` slots of room; 0 if none fits. Work
   * that fits in one block isn't cut up to fill a short gap unless its deadline is tight.
   */
  const chunkFor = (job: Job, t: number, avail: number, runEnd: number): number => {
    if (job.rem <= 0 || job.release > t) return 0;
    const room = keepsDue(job) ? Math.min(avail, (job.due as number) - t) : avail;
    if (room <= 0) return 0;
    if (!job.task.splittable) return job.rem <= room ? job.rem : 0;
    if (job.rem <= Math.min(room, job.maxLen)) return job.rem;
    if (job.rem <= job.maxLen && !tight(job, runEnd)) return 0;
    // Too little to make two chunks of the minimum: one block, a little over the maximum.
    if (job.rem < 2 * job.minLen) return job.rem <= room ? job.rem : 0;
    let len = Math.min(room, job.maxLen);
    if (job.rem - len < job.minLen) len = job.rem - job.minLen;
    return len >= job.minLen ? len : 0;
  };

  /** Dated work due at or before `due` (all of it when null), minus `except`. */
  const demandBy = (due: number | null, except: Job | null) => {
    let sum = 0;
    for (const j of jobs) {
      if (j === except || j.rem <= 0 || j.due === null) continue;
      if (due === null || j.due <= due) sum += j.rem;
    }
    return sum;
  };

  /** Whether everything due before `alt` still fits if `alt` takes the time up to `from`. */
  const safeToDefer = (alt: Job, from: number) => {
    for (const k of jobs) {
      if (k === alt || k.rem <= 0 || k.due === null) continue;
      if (alt.due !== null && k.due >= alt.due) continue;
      if (freeBetween(from, k.due) * EFFICIENCY < demandBy(k.due, alt)) return false;
    }
    return true;
  };

  /** Whether a one-sitting job has another gap long enough after slot `after`. */
  const laterRoom = (job: Job, after: number) => {
    const limit = keepsDue(job) ? (job.due as number) : grid.size;
    for (const [a, b] of runs) {
      const s = Math.max(a, after, job.release);
      if (Math.min(b, limit) - s >= job.rem) return true;
    }
    return false;
  };

  const chunks: Chunk[] = [];
  let lastSubject: string | null = null;
  // Kept work that ended just before the plan starts still earns its break.
  let lastWorkEnd = Number.NEGATIVE_INFINITY;
  for (const k of input.kept) {
    const end = Date.parse(k.endAt);
    if (k.mode === 'work' && end <= grid.start) lastWorkEnd = Math.max(lastWorkEnd, grid.ceil(end));
  }
  const runningId = variant.running ? (input.runningTaskId ?? null) : null;

  const choose = (t: number, avail: number, runEnd: number) => {
    const candidates: { job: Job; len: number }[] = [];
    for (const job of jobs) {
      const len = chunkFor(job, t, avail, runEnd);
      if (len > 0) candidates.push({ job, len });
    }
    const first = candidates[0];
    if (!first) return null;
    if (chunks.length === 0 && runningId) {
      const running = candidates.find((c) => c.job.task.id === runningId);
      if (running) return { ...running, why: 'running' as Why };
    }
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
    if (job.due !== null && t + first.len > job.due) why = 'late';
    else if (jobs.some((j) => j.rank < job.rank && j.rem > 0 && j.release <= t)) why = 'fits';
    else why = job.due === null ? 'undated' : 'urgent';
    return { ...first, why };
  };

  let t = 0;
  while (t < grid.size) {
    const flag = grid.flags[t] ?? 0;
    if (flag !== 0) {
      if (flag & WORK) lastWorkEnd = t + 1;
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
    const spareMin =
      job.due === null ? null : (freeBetween(t, job.due) - demandBy(job.due, null)) * SLOT_MIN;
    grid.markSlots(t, t + len, WORK);
    chunks.push({ job, start: t, len, why, spareMin });
    job.rem -= len;
    lastSubject = job.task.subject;
    lastWorkEnd = t + len;
    t += len;
  }

  const untilSlot = grid.floor(input.until.getTime());
  let missing = 0;
  for (const j of jobs) {
    if (j.rem > 0 && keepsDue(j) && (j.due as number) <= untilSlot) missing += j.rem;
  }
  return { grid, jobs, chunks, missing };
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
    };
  });
}

function focusWarnings(result: FocusResult, input: PlanInput, say: Wording): PlanWarning[] {
  const warnings: PlanWarning[] = [];
  const nowMs = input.now.getTime();
  const untilMs = input.until.getTime();
  for (const job of result.jobs) {
    const { task } = job;
    if (!task.dueAt) continue;
    const dueMs = Date.parse(task.dueAt);
    if (task.allowLate) {
      const last = result.chunks.filter((c) => c.job === job).at(-1);
      const endMs = last ? result.grid.time(last.start + last.len) : null;
      if (endMs !== null && endMs > dueMs) warnings.push(lateWarning(task, endMs, say));
      continue;
    }
    if (job.rem <= 0 || dueMs > untilMs) continue;
    const minutes = job.rem * SLOT_MIN;
    const options: PlanOption[] = ['plan-late'];
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
            options: ['plan-late', 'edit-task'],
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
  const due = task.dueAt ? ` before it's due ${say.when(Date.parse(task.dueAt))}` : ' this week';
  const minutes = task.steps.length > 0 ? sumMinutes(task.steps) : task.remainingMin;
  return {
    kind: 'unplaced',
    taskId: task.id,
    title: task.title,
    dueAt: task.dueAt,
    minutes,
    message: `${task.title} isn't planned. ${what} fit${due}: waits can't overlap sleep, classes or other commitments, and each hands-on step needs free time.`,
    options: task.dueAt && !task.allowLate ? ['plan-late', 'edit-task'] : ['edit-task'],
  };
}

function lateWarning(task: PlanTask, endMs: number, say: Wording): PlanWarning {
  const dueMs = Date.parse(task.dueAt as string);
  return {
    kind: 'late',
    taskId: task.id,
    title: task.title,
    dueAt: task.dueAt,
    minutes: Math.max(0, Math.round((endMs - dueMs) / 60_000)),
    message: `${task.title} is planned to finish ${say.when(endMs)}, after it's due ${say.when(dueMs)} (you allowed late work).`,
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

  chunkReason(c: Chunk, part: number, parts: number): string {
    const { task } = c.job;
    const out: string[] = [];
    if (parts > 1) out.push(`Part ${part} of ${parts}.`);
    if (task.dueAt) {
      const due = `Due ${this.when(Date.parse(task.dueAt))}`;
      if (c.why === 'late') out.push(`${due}: planned late, as you allowed.`);
      else if (c.spareMin !== null && c.spareMin > 0) {
        out.push(`${due}, with ${formatMinutes(c.spareMin)} of free time to spare.`);
      } else out.push(`${due}, and time is tight.`);
    } else if (c.why !== 'undated') out.push('No due date.');
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
      case 'undated':
        out.push(`No due date: planned after dated work (${task.priority} priority).`);
        break;
      case 'late':
        break;
    }
    if (!task.splittable && c.why !== 'one-sitting') out.push('One sitting, as set on the task.');
    return out.join(' ');
  }

  sequenceReason(
    task: PlanTask,
    seg: Segment,
    ctx: { stepNumber: number; handsOn: number; afterWait: number | null; late: boolean },
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
    if (task.dueAt) {
      const due = `Due ${this.when(Date.parse(task.dueAt))}`;
      out.push(ctx.late ? `${due}: planned late, as you allowed.` : `${due}.`);
    }
    if (seg.kind !== 'wait') out.push('The first day it fits, where it splits free time least.');
    return out.join(' ');
  }
}
