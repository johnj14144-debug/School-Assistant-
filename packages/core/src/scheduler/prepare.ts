import { formatMinutes } from '../tasks/duration';
import type { Task } from '../tasks/schemas';
import { addDays } from '../time/local-date';
import { fromZoned, toZoned } from '../time/zone';
import type { PlanTask } from './plan';
import type { PlanWarning } from './schemas';

/**
 * Tasks as the app stores them → what the planner places (M5).
 *
 * - Only open tasks with no open subtasks are planned; a parent's work is planned through its
 *   subtasks, which take the earliest due date (with its hard/soft kind) and the latest
 *   earliest start up their tree.
 * - Work left = estimate − time logged on the task and its subtasks − blocks from now on that
 *   stay (manual, locked, in progress). A task without an estimate is planned for the default
 *   estimate (owner decision Q11). Tasks with steps plan all their steps unless a kept block is
 *   already on the calendar for them.
 * - A task whose estimate is used up isn't planned; it comes back as a warning.
 */

export type PlannableTask = Pick<
  Task,
  | 'id'
  | 'parentId'
  | 'title'
  | 'courseId'
  | 'priority'
  | 'attention'
  | 'estimateMin'
  | 'dueAt'
  | 'deadline'
  | 'earliestStartAt'
  | 'splittable'
  | 'minChunkMin'
  | 'steps'
  | 'status'
  | 'createdAt'
>;

export interface PrepareInput {
  tasks: readonly PlannableTask[];
  /** Minutes logged per task, including its subtasks (`rollupMinutes`). */
  actualMin: ReadonlyMap<string, number>;
  /** Minutes per task in blocks from now on that stay where they are. */
  keptMin: ReadonlyMap<string, number>;
  /** Minutes planned for a task without an estimate (setting `planner.defaultEstimateMin`). */
  defaultEstimateMin: number;
  until: Date;
}

export function preparePlan(input: PrepareInput): { tasks: PlanTask[]; warnings: PlanWarning[] } {
  const byId = new Map(input.tasks.map((t) => [t.id, t]));
  const hasOpenChild = new Set<string>();
  for (const t of input.tasks) {
    if (t.parentId && t.status === 'open') hasOpenChild.add(t.parentId);
  }
  const untilMs = input.until.getTime();
  const tasks: PlanTask[] = [];
  const warnings: PlanWarning[] = [];

  for (const task of input.tasks) {
    if (task.status !== 'open' || hasOpenChild.has(task.id)) continue;
    const chain = ancestry(task, byId);
    const { dueAt, deadline } = earliestDue(chain);
    const earliestStartAt = latest(chain.map((t) => t.earliestStartAt));
    if (earliestStartAt && Date.parse(earliestStartAt) >= untilMs) continue;
    const root = chain.at(-1) ?? task;
    const kept = input.keptMin.get(task.id) ?? 0;
    const base = {
      id: task.id,
      title: task.title,
      subject: task.courseId ?? `task:${root.id}`,
      priority: task.priority,
      background: task.attention === 'background',
      dueAt,
      deadline,
      earliestStartAt,
      splittable: task.splittable,
      minChunkMin: task.minChunkMin,
      steps: task.steps,
      createdAt: task.createdAt,
      estimated: task.estimateMin !== null,
    };
    if (task.steps.length > 0) {
      if (kept === 0) tasks.push({ ...base, remainingMin: 0 });
      continue;
    }
    const estimate = task.estimateMin ?? input.defaultEstimateMin;
    const logged = input.actualMin.get(task.id) ?? 0;
    const left = estimate - logged;
    if (left <= 0) {
      if (kept === 0) warnings.push(spent(task, dueAt, estimate, logged));
      continue;
    }
    const remainingMin = Math.ceil(left - kept);
    if (remainingMin > 0) tasks.push({ ...base, remainingMin });
  }
  return { tasks, warnings };
}

/** The task, its parent, its parent's parent… (a cycle in bad data stops the walk). */
function ancestry(task: PlannableTask, byId: Map<string, PlannableTask>): PlannableTask[] {
  const chain = [task];
  const seen = new Set([task.id]);
  for (let p = task.parentId; p !== null && !seen.has(p); ) {
    const parent = byId.get(p);
    if (!parent) break;
    chain.push(parent);
    seen.add(p);
    p = parent.parentId;
  }
  return chain;
}

/** The earliest due date up the tree; a hard one wins a tie. */
function earliestDue(chain: PlannableTask[]): Pick<PlannableTask, 'dueAt' | 'deadline'> {
  let best: PlannableTask = chain[0] as PlannableTask;
  for (const t of chain) {
    if (t.dueAt < best.dueAt || (t.dueAt === best.dueAt && t.deadline === 'hard')) best = t;
  }
  return { dueAt: best.dueAt, deadline: best.deadline };
}

const latest = (values: (string | null)[]) =>
  values.reduce<string | null>(
    (max, v) => (v !== null && (max === null || v > max) ? v : max),
    null,
  );

function spent(task: PlannableTask, dueAt: string, estimate: number, logged: number) {
  const message =
    task.estimateMin === null
      ? `${task.title} has no estimate and already has ${formatMinutes(logged)} logged, more than the ${formatMinutes(estimate)} default; add an estimate to plan more time.`
      : `${task.title} has used its ${formatMinutes(estimate)} estimate but isn't done; raise the estimate to plan more time.`;
  return {
    kind: 'spent',
    taskId: task.id,
    title: task.title,
    dueAt,
    minutes: 0,
    message,
    options: ['edit-task'],
  } satisfies PlanWarning;
}

/** "Plan my week": from now to midnight at the end of the 7th day (today included). */
export function planHorizon(now: Date, timeZone: string, days = 7): { from: Date; until: Date } {
  const z = toZoned(now.getTime(), timeZone);
  const end = addDays({ year: z.year, month: z.month, day: z.day }, days);
  return { from: now, until: new Date(fromZoned({ ...end, hour: 0, minute: 0 }, timeZone)) };
}
