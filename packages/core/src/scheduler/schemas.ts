import { z } from 'zod';
import { idSchema, utcInstantSchema } from '../schemas/course';

/**
 * What a planner run reports (M5): warnings with the options the user can take, and a summary
 * the app keeps until the next run.
 */

/**
 * - `make-soft`: make the hard deadline soft, so the rest is planned after it.
 * - `allow-split`: let a one-sitting task be split over several blocks.
 * - `edit-task`: open the task (estimate, due date, earliest start).
 */
export const planOptionSchema = z.enum(['make-soft', 'allow-split', 'edit-task']);
export type PlanOption = z.infer<typeof planOptionSchema>;

/**
 * - `short`: part of the work doesn't fit before its hard due date.
 * - `overdue`: a hard due date has passed with work left.
 * - `late`: a soft deadline isn't met (work after it, or left for next week).
 * - `unplaced`: the steps of a laundry-style task (or a background task) fit nowhere.
 * - `spent`: the estimate (or the default for tasks without one) is used up but the task is
 *   still open.
 */
export const planWarningKindSchema = z.enum(['short', 'overdue', 'late', 'unplaced', 'spent']);
export type PlanWarningKind = z.infer<typeof planWarningKindSchema>;

export const planWarningSchema = z.object({
  kind: planWarningKindSchema,
  taskId: idSchema,
  title: z.string(),
  dueAt: utcInstantSchema,
  /** Minutes that don't fit (short, overdue, unplaced) or that are planned late (late). */
  minutes: z.number().int().min(0),
  message: z.string(),
  options: z.array(planOptionSchema),
});
export type PlanWarning = z.infer<typeof planWarningSchema>;

/**
 * What a re-plan did to one task's blocks (M6): `moved` (some went, others came), `added` or
 * `removed`. `from` is the first block that went, `to` the first that came.
 */
export const planChangeSchema = z.object({
  taskId: idSchema,
  title: z.string(),
  kind: z.enum(['moved', 'added', 'removed']),
  from: utcInstantSchema.nullable(),
  to: utcInstantSchema.nullable(),
  /** Minutes planned for the task after the change (removed: minutes that went). */
  minutes: z.number().int().min(0),
});
export type PlanChange = z.infer<typeof planChangeSchema>;

/**
 * What started a plan: "Plan my week" (`plan`), "Re-plan now" (`manual`), finishing or stopping
 * a task early (`finish`), a timer running past its block (`overrun`), or a change to tasks or
 * the calendar (`edit`).
 */
export const planTriggerSchema = z.enum(['plan', 'manual', 'finish', 'overrun', 'edit']);
export type PlanTrigger = z.infer<typeof planTriggerSchema>;

/** The last plan or re-plan: when it ran, what it covered and what it couldn't do. */
export const planRunSchema = z.object({
  at: utcInstantSchema,
  from: utcInstantSchema,
  until: utcInstantSchema,
  blockCount: z.number().int().min(0),
  /** Minutes of hands-on work planned (waits and background work not counted). */
  plannedMin: z.number().int().min(0),
  warnings: z.array(planWarningSchema),
  // M6 (defaults keep runs stored by M5 valid).
  trigger: planTriggerSchema.default('plan'),
  /** How much of the plan before it a re-plan kept (see `ReplanFallback`). */
  fallback: z.enum(['none', 'partial', 'full']).default('none'),
  /** What a re-plan moved, added or removed; empty for "Plan my week". */
  changes: z.array(planChangeSchema).default([]),
});
export type PlanRun = z.infer<typeof planRunSchema>;

/**
 * The plan is behind (owner decision Q13): a planned work block has been under way for longer
 * than the grace, and its task isn't being timed. Nothing moves until "Re-plan now".
 */
export const planBehindSchema = z.object({
  blockId: idSchema,
  taskId: idSchema,
  title: z.string(),
  plannedStartAt: utcInstantSchema,
  /** The block's start, or when work on the task stopped during the block. */
  sinceAt: utcInstantSchema,
  lateMin: z.number().int().min(0),
  /** The task was worked on during the block, then stopped or paused. */
  stopped: z.boolean(),
});
export type PlanBehind = z.infer<typeof planBehindSchema>;
