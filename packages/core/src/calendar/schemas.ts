import { z } from 'zod';
import { hexColorSchema, idSchema, utcInstantSchema } from '../schemas/course';
import { courseRefSchema, taskAttentionSchema, taskStatusSchema } from '../tasks/schemas';
import { parseLocalDate, parseLocalTime } from '../time/local-date';
import { rruleError } from '../time/recurrence';
import { DEFAULT_TIME_ZONE, isValidTimeZone } from '../time/zone';

/**
 * Calendar objects as stored by the app and passed over IPC (M4). Fixed events (classes, sleep,
 * meals) recur in local time in their own zone (ADR 0007); blocks are planned time for a task,
 * stored as UTC instants.
 */

export const fixedEventKindSchema = z.enum(['class', 'sleep', 'meal', 'hygiene', 'other']);
export type FixedEventKind = z.infer<typeof fixedEventKindSchema>;

/** Default colors per kind; a class linked to a course uses the course's color. */
export const FIXED_EVENT_COLORS: Record<FixedEventKind, string> = {
  class: '#0ea5e9',
  sleep: '#64748b',
  meal: '#f59e0b',
  hygiene: '#14b8a6',
  other: '#8b5cf6',
};

/** A wall-clock date, `YYYY-MM-DD`. */
export const localDateTextSchema = z
  .string()
  .refine((t) => parseLocalDate(t) !== null, 'Use a date like 2026-10-07');
/** A 24-hour wall-clock time, `HH:mm`. */
export const localTimeTextSchema = z
  .string()
  .refine((t) => parseLocalTime(t) !== null, 'Use a 24-hour time like 09:30');
export const timeZoneSchema = z.string().refine(isValidTimeZone, 'Unknown time zone');
/** RFC 5545 RRULE text in the supported subset (see time/recurrence.ts). */
export const rruleTextSchema = z
  .string()
  .trim()
  .superRefine((text, ctx) => {
    const error = rruleError(text);
    if (error) ctx.addIssue({ code: 'custom', message: error });
  });

export const fixedEventSchema = z.object({
  id: idSchema,
  title: z.string(),
  kind: fixedEventKindSchema,
  /** A class's course in Grade Calc (its color and code show on the calendar). */
  courseId: idSchema.nullable(),
  location: z.string(),
  /** The first day (RRULE's DTSTART), in the event's zone. */
  startDate: localDateTextSchema,
  startLocal: localTimeTextSchema,
  /** An end at or before the start means the next day (sleep 23:00–06:30). */
  endLocal: localTimeTextSchema,
  /** null: happens once, on `startDate`. */
  rrule: z.string().nullable(),
  timeZone: z.string(),
  /** Skipped occurrences (a cancelled class), by the date they start in the event's zone. */
  exceptions: z.array(localDateTextSchema),
  createdAt: utcInstantSchema,
  updatedAt: utcInstantSchema,
});
export type FixedEvent = z.infer<typeof fixedEventSchema>;

export const blockSourceSchema = z.enum(['manual', 'planner']);
export type BlockSource = z.infer<typeof blockSourceSchema>;

/**
 * What a block holds (M5): `work` on the task (background when the task is), a hands-on `step`
 * of a task with steps (needs the user), or a `wait` between steps (runs alongside anything).
 */
export const blockKindSchema = z.enum(['work', 'step', 'wait']);
export type BlockKind = z.infer<typeof blockKindSchema>;

export const blockSchema = z.object({
  id: idSchema,
  /** The task this time is for; deleting the task deletes its blocks. */
  taskId: idSchema.nullable(),
  /** Shown instead of the task's title; required when there is no task. */
  title: z.string(),
  startAt: utcInstantSchema,
  endAt: utcInstantSchema,
  /** Re-planning (M6) never moves a locked block. */
  locked: z.boolean(),
  /** Placed by hand, or by the planner (M5). */
  source: blockSourceSchema,
  kind: blockKindSchema,
  /** The planner's "why here" (M5); empty for manual blocks. */
  reason: z.string(),
  createdAt: utcInstantSchema,
  updatedAt: utcInstantSchema,
});
export type Block = z.infer<typeof blockSchema>;

// Views

/** One occurrence of a fixed event in a date range. */
export const occurrenceViewSchema = z.object({
  eventId: idSchema,
  title: z.string(),
  kind: fixedEventKindSchema,
  location: z.string(),
  courseId: idSchema.nullable(),
  color: hexColorSchema,
  /** The date it starts in the event's zone (the key for skipping it). */
  date: localDateTextSchema,
  startAt: utcInstantSchema,
  endAt: utcInstantSchema,
  /** Minutes added to a short night so sleep never drops below the floor (the March change). */
  extendedMin: z.number().int().min(0),
});
export type OccurrenceView = z.infer<typeof occurrenceViewSchema>;

export const blockViewSchema = blockSchema.extend({
  task: z
    .object({
      id: idSchema,
      title: z.string(),
      status: taskStatusSchema,
      attention: taskAttentionSchema,
      course: courseRefSchema.nullable(),
      running: z.boolean(),
    })
    .nullable(),
  /** Title to show: the block's own, else the task's. */
  label: z.string(),
  color: hexColorSchema,
  /** What the block overlaps now (e.g. a class added after it was placed), or null. */
  conflict: z.string().nullable(),
});
export type BlockView = z.infer<typeof blockViewSchema>;

export const calendarRangeSchema = z.object({
  occurrences: z.array(occurrenceViewSchema),
  blocks: z.array(blockViewSchema),
  /** Local dates (default zone) in the range with no sleep starting; the floor can't protect them. */
  nightsWithoutSleep: z.array(localDateTextSchema),
});
export type CalendarRange = z.infer<typeof calendarRangeSchema>;

// Inputs. Field rules live once; create adds defaults, update makes every field optional.

const fixedEventFields = z.object({
  title: z.string().trim().min(1).max(120),
  kind: fixedEventKindSchema,
  courseId: idSchema.nullable(),
  location: z.string().trim().max(80),
  startDate: localDateTextSchema,
  startLocal: localTimeTextSchema,
  endLocal: localTimeTextSchema,
  rrule: rruleTextSchema.nullable(),
  timeZone: timeZoneSchema,
});

export const fixedEventCreateSchema = fixedEventFields.extend({
  courseId: fixedEventFields.shape.courseId.default(null),
  location: fixedEventFields.shape.location.default(''),
  rrule: fixedEventFields.shape.rrule.default(null),
  timeZone: timeZoneSchema.default(DEFAULT_TIME_ZONE),
});
export const fixedEventUpdateSchema = fixedEventFields.partial().extend({ id: idSchema });
/** Skips one occurrence (or brings it back). */
export const fixedEventSkipSchema = z.object({
  id: idSchema,
  date: localDateTextSchema,
  skip: z.boolean(),
});

const blockFields = z.object({
  taskId: idSchema.nullable(),
  title: z.string().trim().max(200),
  startAt: utcInstantSchema,
  endAt: utcInstantSchema,
  locked: z.boolean(),
});
export const blockCreateSchema = blockFields.extend({
  taskId: blockFields.shape.taskId.default(null),
  title: blockFields.shape.title.default(''),
  locked: z.boolean().default(false),
});
export const blockUpdateSchema = blockFields.partial().extend({ id: idSchema });

export const calendarRangeInputSchema = z.object({ from: utcInstantSchema, to: utcInstantSchema });

export type FixedEventCreate = z.input<typeof fixedEventCreateSchema>;
export type FixedEventUpdate = z.input<typeof fixedEventUpdateSchema>;
export type BlockCreate = z.input<typeof blockCreateSchema>;
export type BlockUpdate = z.input<typeof blockUpdateSchema>;
