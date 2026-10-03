import { z } from 'zod';
import { hexColorSchema, idSchema, utcInstantSchema } from '../schemas/course';
import { taskStepsSchema } from './steps';

/**
 * Tasks and timer sessions as stored by the app and passed over IPC. Instants are UTC ISO
 * strings (ADR 0007); durations are whole minutes.
 */

export const taskPrioritySchema = z.enum(['low', 'normal', 'high']);
export type TaskPriority = z.infer<typeof taskPrioritySchema>;

/**
 * How much of the user the task takes. `focus` and `light` tasks share one timer (one at a time);
 * `background` tasks (laundry, a download) can run alongside them.
 */
export const taskAttentionSchema = z.enum(['focus', 'light', 'background']);
export type TaskAttention = z.infer<typeof taskAttentionSchema>;

export const taskStatusSchema = z.enum(['open', 'done']);
export type TaskStatus = z.infer<typeof taskStatusSchema>;

/** Where a session was recorded: the desktop timer, a phone button (M14), or typed in. */
export const sessionSourceSchema = z.enum(['desktop', 'phone', 'manual']);
export type SessionSource = z.infer<typeof sessionSourceSchema>;

export const taskSchema = z.object({
  id: idSchema,
  /** Set for a subtask. Deleting a task deletes its subtasks. */
  parentId: idSchema.nullable(),
  title: z.string(),
  description: z.string(),
  courseId: idSchema.nullable(),
  assignmentId: idSchema.nullable(),
  /** Free text such as "homework" or "reading"; history and the estimator group by course + type. */
  type: z.string(),
  /** How much there is to do, e.g. 12 (problems). */
  quantity: z.number().min(0).nullable(),
  unit: z.string(),
  estimateMin: z.number().int().min(0).nullable(),
  dueAt: utcInstantSchema.nullable(),
  priority: taskPrioritySchema,
  attention: taskAttentionSchema,
  /** Position on the Today list; null when the task isn't on it. */
  todayOrder: z.number().int().nullable(),
  /** The planner doesn't place work before this (M5). */
  earliestStartAt: utcInstantSchema.nullable(),
  /** The planner may spread the work over several blocks; false: one sitting. */
  splittable: z.boolean(),
  /** The shortest block worth planning for it, in minutes. */
  minChunkMin: z.number().int().min(5).max(480),
  /** When the work can't fit before the due date, plan the rest after it. */
  allowLate: z.boolean(),
  /** Hands-on steps and waits (laundry); empty for an ordinary task. */
  steps: taskStepsSchema,
  status: taskStatusSchema,
  completedAt: utcInstantSchema.nullable(),
  /** What was done, written when finishing the task. */
  completionNote: z.string(),
  createdAt: utcInstantSchema,
  updatedAt: utcInstantSchema,
});
export type Task = z.infer<typeof taskSchema>;

export const timeSessionSchema = z.object({
  id: idSchema,
  taskId: idSchema,
  startAt: utcInstantSchema,
  /** null while the timer runs. */
  endAt: utcInstantSchema.nullable(),
  source: sessionSourceSchema,
});
export type TimeSession = z.infer<typeof timeSessionSchema>;

export const courseRefSchema = z.object({
  id: idSchema,
  name: z.string(),
  code: z.string(),
  color: hexColorSchema,
});
export type CourseRef = z.infer<typeof courseRefSchema>;

/** A task in a list, with its course and the time spent on it and its subtasks. */
export const taskListItemSchema = taskSchema.extend({
  course: courseRefSchema.nullable(),
  /** Minutes on this task and its subtasks, counting a running timer up to now. */
  actualMin: z.number().min(0),
  /** A session of this task is open right now. */
  running: z.boolean(),
  subtaskCount: z.number().int(),
  subtasksDone: z.number().int(),
});
export type TaskListItem = z.infer<typeof taskListItemSchema>;

export const taskDetailSchema = z.object({
  task: taskListItemSchema,
  assignment: z
    .object({ id: idSchema, title: z.string(), dueAt: utcInstantSchema.nullable() })
    .nullable(),
  /** Every ancestor, outermost first, for the breadcrumb. */
  ancestors: z.array(z.object({ id: idSchema, title: z.string() })),
  subtasks: z.array(taskListItemSchema),
  /** This task's own sessions, newest first. */
  sessions: z.array(timeSessionSchema),
  /** Minutes on this task alone (without subtasks). */
  ownMin: z.number().min(0),
});
export type TaskDetail = z.infer<typeof taskDetailSchema>;

// Inputs. Field rules live once; create adds defaults, update makes every field optional.

const taskFields = z.object({
  parentId: idSchema.nullable(),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(10_000),
  courseId: idSchema.nullable(),
  assignmentId: idSchema.nullable(),
  type: z.string().trim().max(40),
  quantity: z.number().min(0).max(100_000).nullable(),
  unit: z.string().trim().max(30),
  estimateMin: z.number().int().min(0).max(100_000).nullable(),
  dueAt: utcInstantSchema.nullable(),
  priority: taskPrioritySchema,
  attention: taskAttentionSchema,
  earliestStartAt: utcInstantSchema.nullable(),
  splittable: z.boolean(),
  minChunkMin: z.number().int().min(5).max(480),
  allowLate: z.boolean(),
  steps: taskStepsSchema,
});

/** A new task's shortest planned block (M5). */
export const DEFAULT_MIN_CHUNK_MIN = 30;

export const taskCreateSchema = taskFields.extend({
  parentId: taskFields.shape.parentId.default(null),
  description: taskFields.shape.description.default(''),
  /** Left out: a subtask takes its parent's course, otherwise none. */
  courseId: taskFields.shape.courseId.optional(),
  assignmentId: taskFields.shape.assignmentId.default(null),
  /** Left out: a subtask takes its parent's type, otherwise none. */
  type: taskFields.shape.type.optional(),
  quantity: taskFields.shape.quantity.default(null),
  unit: taskFields.shape.unit.default(''),
  estimateMin: taskFields.shape.estimateMin.default(null),
  dueAt: taskFields.shape.dueAt.default(null),
  priority: taskPrioritySchema.default('normal'),
  attention: taskAttentionSchema.default('focus'),
  earliestStartAt: taskFields.shape.earliestStartAt.default(null),
  splittable: z.boolean().default(true),
  minChunkMin: taskFields.shape.minChunkMin.default(DEFAULT_MIN_CHUNK_MIN),
  allowLate: z.boolean().default(false),
  steps: taskStepsSchema.default([]),
  /** Also put it at the end of the Today list. */
  today: z.boolean().default(false),
});
export const taskUpdateSchema = taskFields.partial().extend({ id: idSchema });

export const taskCompleteSchema = z.object({
  id: idSchema,
  note: z.string().trim().max(10_000).default(''),
});

export const sessionCreateSchema = z.object({
  taskId: idSchema,
  startAt: utcInstantSchema,
  endAt: utcInstantSchema,
});
export const sessionUpdateSchema = z.object({
  id: idSchema,
  startAt: utcInstantSchema.optional(),
  /** Can't reopen a closed session; stop or edit the running one instead. */
  endAt: utcInstantSchema.optional(),
});

export type TaskCreate = z.input<typeof taskCreateSchema>;
export type TaskUpdate = z.input<typeof taskUpdateSchema>;
export type SessionCreate = z.input<typeof sessionCreateSchema>;
export type SessionUpdate = z.input<typeof sessionUpdateSchema>;

// Timer, Today list and history views.

/** What the timer shows for one task. */
export const timerEntrySchema = z.object({
  task: taskListItemSchema,
  /** The open session; null for the paused task. */
  session: timeSessionSchema.nullable(),
  /** Minutes on the task and its subtasks before the open session. */
  priorMin: z.number().min(0),
});
export type TimerEntry = z.infer<typeof timerEntrySchema>;

export const timerStateSchema = z.object({
  /** The focus/light task being timed, if any. */
  focus: timerEntrySchema.nullable(),
  /** The focus task the user paused and can resume with one click. */
  paused: timerEntrySchema.nullable(),
  /** Background tasks being timed alongside. */
  background: z.array(timerEntrySchema),
});
export type TimerState = z.infer<typeof timerStateSchema>;

export const todayViewSchema = z.object({
  /** Start of the laptop's current local day. */
  dayStart: utcInstantSchema,
  /** Open tasks on the Today list, in the user's order. */
  tasks: z.array(taskListItemSchema),
  /** Tasks finished today, most recent first. */
  done: z.array(taskListItemSchema),
  /** Focus/light minutes since the start of the day in finished sessions (add the running one). */
  focusMinClosed: z.number().min(0),
});
export type TodayView = z.infer<typeof todayViewSchema>;

export const historyTaskSchema = z.object({
  id: idSchema,
  title: z.string(),
  parentTitle: z.string().nullable(),
  course: courseRefSchema.nullable(),
  type: z.string(),
  quantity: z.number().nullable(),
  unit: z.string(),
  estimateMin: z.number().nullable(),
  actualMin: z.number(),
  completedAt: utcInstantSchema,
  completionNote: z.string(),
});
export type HistoryTask = z.infer<typeof historyTaskSchema>;

export const historyGroupSchema = z.object({
  course: courseRefSchema.nullable(),
  type: z.string(),
  doneCount: z.number().int(),
  /** Time logged on these tasks themselves (subtasks count under their own type). */
  spentMin: z.number(),
  /** Finished tasks with an estimate and timed work, compared at the level that was estimated. */
  compared: z.object({
    count: z.number().int(),
    estimateMin: z.number(),
    actualMin: z.number(),
  }),
});
export type HistoryGroup = z.infer<typeof historyGroupSchema>;

export const historyViewSchema = z.object({
  tasks: z.array(historyTaskSchema),
  groups: z.array(historyGroupSchema),
});
export type HistoryView = z.infer<typeof historyViewSchema>;
