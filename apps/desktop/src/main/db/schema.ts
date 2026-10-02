import type { LetterScale } from '@sa/core';
import { sql } from 'drizzle-orm';
import { check, index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

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
