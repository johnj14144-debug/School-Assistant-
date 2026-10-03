import { z } from 'zod';
import { idSchema, utcInstantSchema } from '../schemas/course';

/**
 * What a planner run reports (M5): warnings with the options the user can take, and a summary
 * the app keeps until the next run.
 */

/**
 * - `plan-late`: plan the rest of the task after its due date (sets `allowLate`).
 * - `allow-split`: let a one-sitting task be split over several blocks.
 * - `edit-task`: open the task (estimate, due date, earliest start).
 */
export const planOptionSchema = z.enum(['plan-late', 'allow-split', 'edit-task']);
export type PlanOption = z.infer<typeof planOptionSchema>;

/**
 * - `short`: part of the work doesn't fit before the due date.
 * - `overdue`: the due date has passed with work left.
 * - `late`: planned after the due date, as the user allowed.
 * - `unplaced`: the steps of a laundry-style task (or a background task) fit nowhere.
 * - `no-estimate`: not planned until it has an estimate.
 * - `spent`: the estimate is used up but the task is still open.
 */
export const planWarningKindSchema = z.enum([
  'short',
  'overdue',
  'late',
  'unplaced',
  'no-estimate',
  'spent',
]);
export type PlanWarningKind = z.infer<typeof planWarningKindSchema>;

export const planWarningSchema = z.object({
  kind: planWarningKindSchema,
  taskId: idSchema,
  title: z.string(),
  dueAt: utcInstantSchema.nullable(),
  /** Minutes that don't fit (short, overdue, unplaced) or that are planned late (late). */
  minutes: z.number().int().min(0),
  message: z.string(),
  options: z.array(planOptionSchema),
});
export type PlanWarning = z.infer<typeof planWarningSchema>;

/** The last "Plan my week": when it ran, what it covered and what it couldn't do. */
export const planRunSchema = z.object({
  at: utcInstantSchema,
  from: utcInstantSchema,
  until: utcInstantSchema,
  blockCount: z.number().int().min(0),
  /** Minutes of hands-on work planned (waits and background work not counted). */
  plannedMin: z.number().int().min(0),
  warnings: z.array(planWarningSchema),
});
export type PlanRun = z.infer<typeof planRunSchema>;
