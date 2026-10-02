import { z } from 'zod';
import { courseGradeSchema, gradingTypeSchema } from '../grades/course-grade';
import { DEFAULT_LETTER_SCALE, letterScaleSchema } from '../grades/letter';

/** Domain objects for Grade Calc as stored by the app and passed over IPC. */

export const courseKindSchema = z.enum(['enrolled', 'self_study']);
export const hexColorSchema = z.string().regex(/^#[0-9a-f]{6}$/i, 'Use a #rrggbb color');
/** Instants are UTC ISO strings (ADR 0007). */
export const utcInstantSchema = z.iso.datetime();
export const idSchema = z.uuid();

export const courseSchema = z.object({
  id: idSchema,
  name: z.string(),
  code: z.string(),
  term: z.string(),
  kind: courseKindSchema,
  grading: gradingTypeSchema,
  letterScale: letterScaleSchema,
  color: hexColorSchema,
  createdAt: utcInstantSchema,
  updatedAt: utcInstantSchema,
});
export type Course = z.infer<typeof courseSchema>;

export const gradeCategorySchema = z.object({
  id: idSchema,
  courseId: idSchema,
  name: z.string(),
  /** Percent of the course grade; ignored by points-based courses. */
  weight: z.number().min(0),
  dropLowest: z.number().int().min(0),
  position: z.number().int(),
});
export type GradeCategory = z.infer<typeof gradeCategorySchema>;

export const assignmentSchema = z.object({
  id: idSchema,
  courseId: idSchema,
  categoryId: idSchema.nullable(),
  title: z.string(),
  dueAt: utcInstantSchema.nullable(),
  pointsPossible: z.number().min(0),
  /** null until graded. */
  pointsEarned: z.number().min(0).nullable(),
  /** Adds earned points without adding possible points; never dropped. */
  extraCredit: z.boolean(),
  createdAt: utcInstantSchema,
  updatedAt: utcInstantSchema,
});
export type Assignment = z.infer<typeof assignmentSchema>;

/** A course with its computed grade, for lists and overview cards. */
export const courseSummarySchema = courseSchema.extend({
  categoryCount: z.number().int(),
  assignmentCount: z.number().int(),
  grade: courseGradeSchema,
});
export type CourseSummary = z.infer<typeof courseSummarySchema>;

/** Everything about one course: categories in order, assignments by due date, the grade. */
export const courseDetailSchema = z.object({
  course: courseSchema,
  categories: z.array(gradeCategorySchema),
  assignments: z.array(assignmentSchema),
  grade: courseGradeSchema,
});
export type CourseDetail = z.infer<typeof courseDetailSchema>;

// Inputs. Field rules live once; create adds defaults, update makes every field optional.

const courseFields = z.object({
  name: z.string().trim().min(1).max(120),
  code: z.string().trim().max(40),
  term: z.string().trim().max(40),
  kind: courseKindSchema,
  grading: gradingTypeSchema,
  letterScale: letterScaleSchema,
  color: hexColorSchema,
});

export const courseCreateSchema = courseFields.extend({
  code: courseFields.shape.code.default(''),
  term: courseFields.shape.term.default(''),
  kind: courseKindSchema.default('enrolled'),
  grading: gradingTypeSchema.default('weighted'),
  letterScale: letterScaleSchema.default(DEFAULT_LETTER_SCALE),
  /** Picked from a palette when left out. */
  color: hexColorSchema.optional(),
});
export const courseUpdateSchema = courseFields.partial().extend({ id: idSchema });

const categoryFields = z.object({
  name: z.string().trim().min(1).max(80),
  weight: z.number().min(0).max(100),
  dropLowest: z.number().int().min(0).max(50),
});

export const categoryCreateSchema = categoryFields.extend({
  courseId: idSchema,
  weight: categoryFields.shape.weight.default(0),
  dropLowest: categoryFields.shape.dropLowest.default(0),
});
export const categoryUpdateSchema = categoryFields.partial().extend({ id: idSchema });

const assignmentFields = z.object({
  categoryId: idSchema.nullable(),
  title: z.string().trim().min(1).max(200),
  dueAt: utcInstantSchema.nullable(),
  pointsPossible: z.number().min(0).max(100_000),
  pointsEarned: z.number().min(0).max(100_000).nullable(),
  extraCredit: z.boolean(),
});

export const assignmentCreateSchema = assignmentFields.extend({
  courseId: idSchema,
  categoryId: assignmentFields.shape.categoryId.default(null),
  dueAt: assignmentFields.shape.dueAt.default(null),
  pointsEarned: assignmentFields.shape.pointsEarned.default(null),
  extraCredit: z.boolean().default(false),
});
export const assignmentUpdateSchema = assignmentFields.partial().extend({ id: idSchema });

export type CourseCreate = z.input<typeof courseCreateSchema>;
export type CourseUpdate = z.input<typeof courseUpdateSchema>;
export type CategoryCreate = z.input<typeof categoryCreateSchema>;
export type CategoryUpdate = z.input<typeof categoryUpdateSchema>;
export type AssignmentCreate = z.input<typeof assignmentCreateSchema>;
export type AssignmentUpdate = z.input<typeof assignmentUpdateSchema>;
