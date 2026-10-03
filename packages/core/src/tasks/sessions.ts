/**
 * Timer session rules. Two invariants hold for every write:
 *
 * 1. A task's sessions never overlap each other.
 * 2. Sessions of focus/light tasks never overlap each other: one thing at a time. Background
 *    tasks (laundry) may overlap anything else.
 *
 * Sessions are half-open intervals [startAt, endAt): one may start at the minute another ends.
 * An open session (endAt null) runs on, so it overlaps everything after its start.
 */

export interface SessionSpan {
  id: string;
  taskId: string;
  /** UTC ISO instants. */
  startAt: string;
  endAt: string | null;
}

const MINUTE_MS = 60_000;

/** Minutes in a session; an open one counts up to `now`. Never negative. */
export function sessionMinutes(session: Pick<SessionSpan, 'startAt' | 'endAt'>, now: Date): number {
  const end = session.endAt ? Date.parse(session.endAt) : now.getTime();
  return Math.max(0, (end - Date.parse(session.startAt)) / MINUTE_MS);
}

/** Minutes of the session that fall inside [from, to). */
export function minutesWithin(
  session: Pick<SessionSpan, 'startAt' | 'endAt'>,
  from: Date,
  to: Date,
): number {
  const start = Math.max(Date.parse(session.startAt), from.getTime());
  const end = Math.min(session.endAt ? Date.parse(session.endAt) : to.getTime(), to.getTime());
  return Math.max(0, (end - start) / MINUTE_MS);
}

function overlaps(a: Pick<SessionSpan, 'startAt' | 'endAt'>, b: SessionSpan): boolean {
  const aEnd = a.endAt ? Date.parse(a.endAt) : Number.POSITIVE_INFINITY;
  const bEnd = b.endAt ? Date.parse(b.endAt) : Number.POSITIVE_INFINITY;
  return Date.parse(a.startAt) < bEnd && Date.parse(b.startAt) < aEnd;
}

export interface SessionRules {
  /** Every session that could conflict (other tasks' too). */
  sessions: readonly SessionSpan[];
  isBackground: (taskId: string) => boolean;
}

/**
 * The first existing session that `candidate` would overlap against the rules above, or null.
 * The candidate's own id (when editing) is ignored.
 */
export function findConflict(
  candidate: Omit<SessionSpan, 'id'> & { id?: string },
  rules: SessionRules,
): SessionSpan | null {
  const background = rules.isBackground(candidate.taskId);
  for (const other of rules.sessions) {
    if (other.id === candidate.id) continue;
    const sameTask = other.taskId === candidate.taskId;
    if (!sameTask && (background || rules.isBackground(other.taskId))) continue;
    if (overlaps(candidate, other)) return other;
  }
  return null;
}

export type StartPlan =
  /** The task's timer is already running. */
  | { kind: 'running'; session: SessionSpan }
  /** Close these open sessions at the start time, then open the new one. */
  | { kind: 'ok'; close: SessionSpan[] }
  /** The start time is at or before the start of a running focus session. */
  | { kind: 'before-running'; session: SessionSpan }
  /** The new session would overlap a finished one. */
  | { kind: 'overlap'; session: SessionSpan };

/**
 * What starting `taskId` at `startAt` (now, or earlier for "I started at…") means: starting a
 * focus/light task stops the one that is running at the moment the new one started; a background
 * task stops nothing.
 */
export function planStart(taskId: string, startAt: string, rules: SessionRules): StartPlan {
  const own = rules.sessions.find((s) => s.taskId === taskId && s.endAt === null);
  if (own) return { kind: 'running', session: own };
  const close = rules.isBackground(taskId)
    ? []
    : rules.sessions.filter((s) => s.endAt === null && !rules.isBackground(s.taskId));
  const start = Date.parse(startAt);
  const early = close.find((s) => Date.parse(s.startAt) >= start);
  if (early) return { kind: 'before-running', session: early };
  const closing = new Set(close.map((s) => s.id));
  const after = rules.sessions.map((s) => (closing.has(s.id) ? { ...s, endAt: startAt } : s));
  const conflict = findConflict(
    { taskId, startAt, endAt: null },
    { sessions: after, isBackground: rules.isBackground },
  );
  if (conflict) return { kind: 'overlap', session: conflict };
  return { kind: 'ok', close };
}
