import type { PlanChange } from './schemas';

/**
 * Re-planning around the plan (M6): what a re-plan changed, and whether the user is behind the
 * plan. Pure, like the planner.
 */

export interface PlanSpan {
  taskId: string;
  startAt: string;
  endAt: string;
}

const minutes = (spans: readonly PlanSpan[]) =>
  Math.round(
    spans.reduce((sum, s) => sum + Date.parse(s.endAt) - Date.parse(s.startAt), 0) / 60_000,
  );
const key = (s: PlanSpan) => `${s.startAt}|${s.endAt}`;

/**
 * Per task, the blocks a re-plan took away and put in: tasks whose blocks are all where they
 * were don't appear. In time order of the first block that went or came.
 */
export function diffPlans(
  before: readonly PlanSpan[],
  after: readonly PlanSpan[],
  titleOf: (taskId: string) => string,
): PlanChange[] {
  const group = (spans: readonly PlanSpan[]) => {
    const out = new Map<string, PlanSpan[]>();
    for (const s of spans) out.set(s.taskId, [...(out.get(s.taskId) ?? []), s]);
    return out;
  };
  const was = group(before);
  const now = group(after);
  const changes: PlanChange[] = [];
  for (const taskId of new Set([...was.keys(), ...now.keys()])) {
    const old = was.get(taskId) ?? [];
    const fresh = now.get(taskId) ?? [];
    const oldKeys = new Set(old.map(key));
    const freshKeys = new Set(fresh.map(key));
    const went = old.filter((s) => !freshKeys.has(key(s))).sort(byStart);
    const came = fresh.filter((s) => !oldKeys.has(key(s))).sort(byStart);
    if (went.length === 0 && came.length === 0) continue;
    changes.push({
      taskId,
      title: titleOf(taskId),
      kind: went.length === 0 ? 'added' : came.length === 0 ? 'removed' : 'moved',
      from: went[0]?.startAt ?? null,
      to: came[0]?.startAt ?? null,
      minutes: came.length === 0 ? minutes(went) : minutes(fresh),
    });
  }
  return changes.sort(
    (a, b) =>
      (a.to ?? a.from ?? '').localeCompare(b.to ?? b.from ?? '') || a.title.localeCompare(b.title),
  );
}

const byStart = (a: PlanSpan, b: PlanSpan) => a.startAt.localeCompare(b.startAt);

export interface BehindBlock extends PlanSpan {
  id: string;
}

export interface BehindSession {
  taskId: string;
  startAt: string;
  /** null while the timer runs. */
  endAt: string | null;
}

export interface Behind {
  block: BehindBlock;
  /** The block's start, or when work on its task stopped during the block. */
  sinceAt: string;
  lateMin: number;
  /** The task was worked on during the block, then stopped. */
  stopped: boolean;
}

/**
 * Whether the user is behind the plan (owner decision Q13): one of `blocks` (planned work the
 * user could be doing) is under way, its task isn't being timed, and that has lasted at least
 * the grace. Lateness counts from the block's start, or from the end of the last session on the
 * task during the block. The longest-late block wins.
 */
export function behindPlan(input: {
  now: Date;
  graceMin: number;
  blocks: readonly BehindBlock[];
  sessions: readonly BehindSession[];
}): Behind | null {
  const t = input.now.getTime();
  let worst: Behind | null = null;
  for (const block of input.blocks) {
    const start = Date.parse(block.startAt);
    if (start > t || Date.parse(block.endAt) <= t) continue;
    let since = start;
    let running = false;
    for (const s of input.sessions) {
      if (s.taskId !== block.taskId) continue;
      if (s.endAt === null) running = true;
      else {
        const end = Date.parse(s.endAt);
        if (end > since && end <= t) since = end;
      }
    }
    if (running) continue;
    const lateMin = Math.floor((t - since) / 60_000);
    if (lateMin < input.graceMin || (worst && lateMin <= worst.lateMin)) continue;
    worst = { block, sinceAt: new Date(since).toISOString(), lateMin, stopped: since > start };
  }
  return worst;
}
