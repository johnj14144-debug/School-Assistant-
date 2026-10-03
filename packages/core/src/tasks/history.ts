import { type SessionSpan, sessionMinutes } from './sessions';

/**
 * Time spent per task and estimate-vs-actual per course + type, from timer sessions.
 *
 * A task's **actual** time includes its subtasks. For the per-type comparison a task tree is
 * measured once, at the highest finished task that has an estimate, so a parent and its
 * subtasks never count the same minutes twice.
 */

export interface HistoryTaskNode {
  id: string;
  parentId: string | null;
  status: 'open' | 'done';
  estimateMin: number | null;
  courseId: string | null;
  type: string;
}

/** Minutes per task id from its own sessions; open ones count up to `now`. */
export function ownMinutes(sessions: readonly SessionSpan[], now: Date): Map<string, number> {
  const own = new Map<string, number>();
  for (const s of sessions) own.set(s.taskId, (own.get(s.taskId) ?? 0) + sessionMinutes(s, now));
  return own;
}

/** Minutes per task including all of its subtasks. Every task in `tasks` gets an entry. */
export function rollupMinutes(
  tasks: readonly Pick<HistoryTaskNode, 'id' | 'parentId'>[],
  own: ReadonlyMap<string, number>,
): Map<string, number> {
  const parentOf = new Map(tasks.map((t) => [t.id, t.parentId]));
  const total = new Map(tasks.map((t) => [t.id, 0]));
  for (const t of tasks) {
    const minutes = own.get(t.id) ?? 0;
    if (minutes === 0) continue;
    const seen = new Set<string>();
    let id: string | null = t.id;
    // Walk up the parents; `seen` guards against a cycle in bad data.
    while (id !== null && !seen.has(id)) {
      const current = total.get(id);
      if (current === undefined) break;
      seen.add(id);
      total.set(id, current + minutes);
      id = parentOf.get(id) ?? null;
    }
  }
  return total;
}

export interface TypeGroup {
  courseId: string | null;
  /** As first written; grouping ignores case and surrounding spaces. */
  type: string;
  doneCount: number;
  /** Own minutes of the finished tasks in the group. */
  spentMin: number;
  compared: { count: number; estimateMin: number; actualMin: number };
}

/**
 * Finished tasks grouped by course + type, most time spent first. `tasks` should include the
 * ancestors of finished tasks so trees are measured once.
 */
export function typeGroups(
  tasks: readonly HistoryTaskNode[],
  own: ReadonlyMap<string, number>,
  rollup: ReadonlyMap<string, number>,
): TypeGroup[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const candidate = (t: HistoryTaskNode) =>
    t.status === 'done' && (t.estimateMin ?? 0) > 0 && (rollup.get(t.id) ?? 0) > 0;
  const hasCandidateAncestor = (t: HistoryTaskNode) => {
    const seen = new Set<string>([t.id]);
    let parent = t.parentId ? byId.get(t.parentId) : undefined;
    while (parent && !seen.has(parent.id)) {
      if (candidate(parent)) return true;
      seen.add(parent.id);
      parent = parent.parentId ? byId.get(parent.parentId) : undefined;
    }
    return false;
  };

  const groups = new Map<string, TypeGroup>();
  for (const t of tasks) {
    if (t.status !== 'done') continue;
    const key = `${t.courseId ?? ''}\u0000${t.type.trim().toLowerCase()}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        courseId: t.courseId,
        type: t.type.trim(),
        doneCount: 0,
        spentMin: 0,
        compared: { count: 0, estimateMin: 0, actualMin: 0 },
      };
      groups.set(key, group);
    }
    group.doneCount += 1;
    group.spentMin += own.get(t.id) ?? 0;
    if (candidate(t) && !hasCandidateAncestor(t)) {
      group.compared.count += 1;
      group.compared.estimateMin += t.estimateMin ?? 0;
      group.compared.actualMin += rollup.get(t.id) ?? 0;
    }
  }
  return [...groups.values()].sort((a, b) => b.spentMin - a.spentMin);
}
