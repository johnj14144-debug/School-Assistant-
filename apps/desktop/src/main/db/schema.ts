import type { LetterScale } from '@sa/core';
import { sql } from 'drizzle-orm';
import {
  type AnySQLiteColumn,
  check,
  index,
  integer,
  real,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core';

/**
 * Database tables (Drizzle). After changing this file, run `pnpm --filter @sa/desktop
 * db:generate` to write the next SQL migration into ./migrations, then commit both.
 * Instants are UTC ISO strings (ADR 0007). IDs are UUIDs made in the main process.
 */

export const settings = sqliteTable('setting', {
  key: text('key').primaryKey(),
  /** JSON text (written by SettingsService, which also stores an explicit null). */
  value: text('value').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const courses = sqliteTable(
  'course',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    code: text('code').notNull().default(''),
    term: text('term').notNull().default(''),
    kind: text('kind', { enum: ['enrolled', 'self_study'] })
      .notNull()
      .default('enrolled'),
    grading: text('grading', { enum: ['weighted', 'points'] }).notNull(),
    letterScale: text('letter_scale', { mode: 'json' }).$type<LetterScale>().notNull(),
    color: text('color').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [
    check('course_kind', sql`${t.kind} in ('enrolled', 'self_study')`),
    check('course_grading', sql`${t.grading} in ('weighted', 'points')`),
  ],
);

export const gradeCategories = sqliteTable(
  'grade_category',
  {
    id: text('id').primaryKey(),
    courseId: text('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    kind: text('kind', { enum: ['regular', 'bonus'] })
      .notNull()
      .default('regular'),
    weight: real('weight').notNull().default(0),
    dropLowest: integer('drop_lowest').notNull().default(0),
    position: integer('position').notNull(),
  },
  (t) => [
    index('grade_category_course_idx').on(t.courseId),
    check('grade_category_kind', sql`${t.kind} in ('regular', 'bonus')`),
    check('grade_category_weight', sql`${t.weight} >= 0`),
    check('grade_category_drop_lowest', sql`${t.dropLowest} >= 0`),
  ],
);

export const assignments = sqliteTable(
  'assignment',
  {
    id: text('id').primaryKey(),
    courseId: text('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    categoryId: text('category_id').references(() => gradeCategories.id, {
      onDelete: 'set null',
    }),
    title: text('title').notNull(),
    dueAt: text('due_at'),
    pointsPossible: real('points_possible').notNull(),
    pointsEarned: real('points_earned'),
    extraCredit: integer('extra_credit', { mode: 'boolean' }).notNull().default(false),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [
    index('assignment_course_idx').on(t.courseId),
    index('assignment_category_idx').on(t.categoryId),
    index('assignment_due_idx').on(t.dueAt),
    check('assignment_points_possible', sql`${t.pointsPossible} >= 0`),
    check('assignment_points_earned', sql`${t.pointsEarned} is null or ${t.pointsEarned} >= 0`),
  ],
);

export const tasks = sqliteTable(
  'task',
  {
    id: text('id').primaryKey(),
    /** A subtask's parent; deleting a task deletes its subtasks. */
    parentId: text('parent_id').references((): AnySQLiteColumn => tasks.id, {
      onDelete: 'cascade',
    }),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    courseId: text('course_id').references(() => courses.id, { onDelete: 'set null' }),
    assignmentId: text('assignment_id').references(() => assignments.id, {
      onDelete: 'set null',
    }),
    type: text('type').notNull().default(''),
    quantity: real('quantity'),
    unit: text('unit').notNull().default(''),
    estimateMin: integer('estimate_min'),
    dueAt: text('due_at'),
    priority: text('priority', { enum: ['low', 'normal', 'high'] })
      .notNull()
      .default('normal'),
    attention: text('attention', { enum: ['focus', 'light', 'background'] })
      .notNull()
      .default('focus'),
    /** Position on the Today list; null when not on it. */
    todayOrder: integer('today_order'),
    status: text('status', { enum: ['open', 'done'] })
      .notNull()
      .default('open'),
    completedAt: text('completed_at'),
    completionNote: text('completion_note').notNull().default(''),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [
    index('task_parent_idx').on(t.parentId),
    index('task_course_idx').on(t.courseId),
    index('task_assignment_idx').on(t.assignmentId),
    index('task_status_idx').on(t.status),
    check('task_priority', sql`${t.priority} in ('low', 'normal', 'high')`),
    check('task_attention', sql`${t.attention} in ('focus', 'light', 'background')`),
    check('task_status', sql`${t.status} in ('open', 'done')`),
    check('task_completed', sql`(${t.status} = 'done') = (${t.completedAt} is not null)`),
    check('task_quantity', sql`${t.quantity} is null or ${t.quantity} >= 0`),
    check('task_estimate', sql`${t.estimateMin} is null or ${t.estimateMin} >= 0`),
  ],
);

/** Timer sessions. An open session (end_at null) is a running timer; it survives restarts. */
export const timeSessions = sqliteTable(
  'time_session',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    startAt: text('start_at').notNull(),
    endAt: text('end_at'),
    source: text('source', { enum: ['desktop', 'phone', 'manual'] })
      .notNull()
      .default('desktop'),
  },
  (t) => [
    index('time_session_task_idx').on(t.taskId),
    index('time_session_start_idx').on(t.startAt),
    index('time_session_open_idx').on(t.endAt),
    check('time_session_source', sql`${t.source} in ('desktop', 'phone', 'manual')`),
    check(
      'time_session_order',
      sql`${t.endAt} is null or julianday(${t.endAt}) > julianday(${t.startAt})`,
    ),
  ],
);

/**
 * Fixed events: classes, sleep, meals, hygiene and anything else that recurs. Times are wall
 * clock in the event's own zone (ADR 0007); core's expandFixedEvents turns them into instants.
 */
export const fixedEvents = sqliteTable(
  'fixed_event',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    kind: text('kind', { enum: ['class', 'sleep', 'meal', 'hygiene', 'other'] }).notNull(),
    courseId: text('course_id').references(() => courses.id, { onDelete: 'set null' }),
    location: text('location').notNull().default(''),
    /** First day, `YYYY-MM-DD` (RRULE's DTSTART). */
    startDate: text('start_date').notNull(),
    /** `HH:mm`; an end at or before the start means the next day. */
    startLocal: text('start_local').notNull(),
    endLocal: text('end_local').notNull(),
    /** RFC 5545 RRULE subset; null = once. */
    rrule: text('rrule'),
    timeZone: text('time_zone').notNull(),
    /** Skipped occurrence dates, JSON `["YYYY-MM-DD", …]`. */
    exceptions: text('exceptions', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [
    index('fixed_event_course_idx').on(t.courseId),
    check('fixed_event_kind', sql`${t.kind} in ('class', 'sleep', 'meal', 'hygiene', 'other')`),
  ],
);

/** Planned time on the calendar, by hand (M4) or by the planner (M5). */
export const blocks = sqliteTable(
  'block',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id').references(() => tasks.id, { onDelete: 'cascade' }),
    title: text('title').notNull().default(''),
    startAt: text('start_at').notNull(),
    endAt: text('end_at').notNull(),
    locked: integer('locked', { mode: 'boolean' }).notNull().default(false),
    source: text('source', { enum: ['manual', 'planner'] })
      .notNull()
      .default('manual'),
    reason: text('reason').notNull().default(''),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [
    index('block_task_idx').on(t.taskId),
    index('block_start_idx').on(t.startAt),
    check('block_source', sql`${t.source} in ('manual', 'planner')`),
    check('block_order', sql`julianday(${t.endAt}) > julianday(${t.startAt})`),
  ],
);
