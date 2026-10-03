import { randomUUID } from 'node:crypto';
import {
  type Assignment,
  type assignmentCreateSchema,
  type assignmentUpdateSchema,
  type Course,
  type CourseDetail,
  type CourseSummary,
  type categoryCreateSchema,
  type categoryUpdateSchema,
  type courseCreateSchema,
  courseGrade,
  type courseUpdateSchema,
  type GradeCategory,
} from '@sa/core';
import { asc, eq, sql } from 'drizzle-orm';
import type { z } from 'zod';
import type { Db } from '../../db/database';
import { assignments, courses, gradeCategories } from '../../db/schema';

/** Default course colors, used in turn. */
const PALETTE = [
  '#6366f1',
  '#0ea5e9',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#64748b',
];

const assignmentOrder = [
  sql`${assignments.dueAt} is null`,
  asc(assignments.dueAt),
  asc(assignments.createdAt),
];

export interface GradesDeps {
  db: Db;
  now?: () => Date;
  newId?: () => string;
}

/** Courses, grading categories and assignments for Grade Calc, plus computed grades. */
export class GradesService {
  private readonly db: Db;
  private readonly now: () => Date;
  private readonly newId: () => string;

  constructor(deps: GradesDeps) {
    this.db = deps.db;
    this.now = deps.now ?? (() => new Date());
    this.newId = deps.newId ?? randomUUID;
  }

  listCourses(): CourseSummary[] {
    const allCourses = this.db.select().from(courses).orderBy(asc(courses.createdAt)).all();
    const allCategories = this.db
      .select()
      .from(gradeCategories)
      .orderBy(asc(gradeCategories.position))
      .all();
    const allAssignments = this.db.select().from(assignments).all();
    return allCourses.map((course) => {
      const categories = allCategories.filter((c) => c.courseId === course.id);
      const items = allAssignments.filter((a) => a.courseId === course.id);
      return {
        ...course,
        categoryCount: categories.length,
        assignmentCount: items.length,
        grade: courseGrade({ grading: course.grading, categories, assignments: items }),
      };
    });
  }

  getCourse(id: string): CourseDetail {
    const course = this.requireCourse(id);
    const categories = this.db
      .select()
      .from(gradeCategories)
      .where(eq(gradeCategories.courseId, id))
      .orderBy(asc(gradeCategories.position))
      .all();
    const items = this.db
      .select()
      .from(assignments)
      .where(eq(assignments.courseId, id))
      .orderBy(...assignmentOrder)
      .all();
    return {
      course,
      categories,
      assignments: items,
      grade: courseGrade({ grading: course.grading, categories, assignments: items }),
    };
  }

  createCourse(input: z.output<typeof courseCreateSchema>): Course {
    const stamp = this.now().toISOString();
    const count = this.db.select({ n: sql<number>`count(*)` }).from(courses).get()?.n ?? 0;
    const course: Course = {
      ...input,
      id: this.newId(),
      color: input.color ?? PALETTE[count % PALETTE.length] ?? '#6366f1',
      createdAt: stamp,
      updatedAt: stamp,
    };
    this.db.insert(courses).values(course).run();
    return course;
  }

  updateCourse({ id, ...patch }: z.output<typeof courseUpdateSchema>): Course {
    this.requireCourse(id);
    this.db
      .update(courses)
      .set({ ...patch, updatedAt: this.now().toISOString() })
      .where(eq(courses.id, id))
      .run();
    return this.requireCourse(id);
  }

  /** Deletes the course with its categories and assignments. */
  deleteCourse(id: string): void {
    this.requireCourse(id);
    this.db.delete(courses).where(eq(courses.id, id)).run();
  }

  createCategory(input: z.output<typeof categoryCreateSchema>): GradeCategory {
    this.requireCourse(input.courseId);
    const last = this.db
      .select({ position: sql<number | null>`max(${gradeCategories.position})` })
      .from(gradeCategories)
      .where(eq(gradeCategories.courseId, input.courseId))
      .get();
    const category: GradeCategory = {
      ...input,
      id: this.newId(),
      position: (last?.position ?? -1) + 1,
    };
    this.db.insert(gradeCategories).values(category).run();
    return category;
  }

  updateCategory({ id, ...patch }: z.output<typeof categoryUpdateSchema>): GradeCategory {
    this.requireCategory(id);
    if (Object.keys(patch).length > 0) {
      this.db.update(gradeCategories).set(patch).where(eq(gradeCategories.id, id)).run();
    }
    return this.requireCategory(id);
  }

  /** Deletes the category; its assignments stay, uncategorized. */
  deleteCategory(id: string): void {
    this.requireCategory(id);
    this.db.delete(gradeCategories).where(eq(gradeCategories.id, id)).run();
  }

  createAssignment(input: z.output<typeof assignmentCreateSchema>): Assignment {
    this.requireCourse(input.courseId);
    this.checkCategory(input.categoryId, input.courseId);
    const stamp = this.now().toISOString();
    const assignment: Assignment = {
      ...input,
      id: this.newId(),
      createdAt: stamp,
      updatedAt: stamp,
    };
    this.db.insert(assignments).values(assignment).run();
    return assignment;
  }

  /** Adds several assignments in one transaction: all of them or none. */
  createAssignments(inputs: z.output<typeof assignmentCreateSchema>[]): Assignment[] {
    // better-sqlite3 has one connection, so everything inside runs in this transaction.
    return this.db.transaction(() => inputs.map((input) => this.createAssignment(input)));
  }

  updateAssignment({ id, ...patch }: z.output<typeof assignmentUpdateSchema>): Assignment {
    const existing = this.requireAssignment(id);
    if (patch.categoryId !== undefined) this.checkCategory(patch.categoryId, existing.courseId);
    this.db
      .update(assignments)
      .set({ ...patch, updatedAt: this.now().toISOString() })
      .where(eq(assignments.id, id))
      .run();
    return this.requireAssignment(id);
  }

  deleteAssignment(id: string): void {
    this.requireAssignment(id);
    this.db.delete(assignments).where(eq(assignments.id, id)).run();
  }

  private requireCourse(id: string): Course {
    const course = this.db.select().from(courses).where(eq(courses.id, id)).get();
    if (!course) throw new Error('Course not found');
    return course;
  }

  private requireCategory(id: string): GradeCategory {
    const category = this.db.select().from(gradeCategories).where(eq(gradeCategories.id, id)).get();
    if (!category) throw new Error('Grading category not found');
    return category;
  }

  private requireAssignment(id: string): Assignment {
    const assignment = this.db.select().from(assignments).where(eq(assignments.id, id)).get();
    if (!assignment) throw new Error('Assignment not found');
    return assignment;
  }

  /** An assignment's category must belong to the same course. */
  private checkCategory(categoryId: string | null, courseId: string): void {
    if (categoryId === null) return;
    if (this.requireCategory(categoryId).courseId !== courseId) {
      throw new Error('That grading category belongs to a different course');
    }
  }
}
