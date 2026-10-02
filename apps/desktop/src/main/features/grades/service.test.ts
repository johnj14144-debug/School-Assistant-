import {
  assignmentCreateSchema,
  assignmentUpdateSchema,
  categoryCreateSchema,
  courseCreateSchema,
  courseUpdateSchema,
} from '@sa/core';
import { describe, expect, it } from 'vitest';
import { openDatabase } from '../../db/database';
import { fakeClock } from '../../test/helpers';
import { GradesService } from './service';

function setup() {
  const clock = fakeClock('2026-10-02T15:00:00.000Z');
  const database = openDatabase(':memory:');
  const service = new GradesService({ db: database.db, now: clock.now });
  // Inputs go through the same schemas as IPC, so defaults apply exactly as in the app.
  const course = (name: string, extra: object = {}) =>
    service.createCourse(courseCreateSchema.parse({ name, ...extra }));
  const category = (courseId: string, name: string, weight: number, dropLowest = 0) =>
    service.createCategory(categoryCreateSchema.parse({ courseId, name, weight, dropLowest }));
  const assignment = (courseId: string, extra: object) =>
    service.createAssignment(assignmentCreateSchema.parse({ courseId, title: 'Work', ...extra }));
  return { clock, database, service, course, category, assignment };
}

describe('GradesService', () => {
  it('creates a course with defaults and a palette color', () => {
    const { course } = setup();
    const first = course('MATH 2413');
    expect(first).toMatchObject({
      name: 'MATH 2413',
      kind: 'enrolled',
      grading: 'weighted',
      color: '#6366f1',
      createdAt: '2026-10-02T15:00:00.000Z',
    });
    expect(course('PHYS 1321').color).toBe('#0ea5e9');
    expect(course('ENGL 1304', { color: '#123abc' }).color).toBe('#123abc');
  });

  it('lists courses with counts and their current, max and min grade', () => {
    const { service, course, category, assignment } = setup();
    const calc = course('Calc');
    const hw = category(calc.id, 'Homework', 40);
    const exams = category(calc.id, 'Exams', 60);
    assignment(calc.id, { categoryId: hw.id, pointsPossible: 10, pointsEarned: 9.5 });
    assignment(calc.id, { categoryId: exams.id, pointsPossible: 100, pointsEarned: 80 });
    assignment(calc.id, { categoryId: exams.id, pointsPossible: 100 });
    course('Empty');

    const [first, second] = service.listCourses();
    expect(first).toMatchObject({ name: 'Calc', categoryCount: 2, assignmentCount: 3 });
    expect(first?.grade.current).toBe(86); // 0.4 × 95 + 0.6 × 80
    expect(first?.grade.max).toBe(92); // 0.4 × 95 + 0.6 × 90
    expect(first?.grade.min).toBe(62); // 0.4 × 95 + 0.6 × 40
    expect(second).toMatchObject({ name: 'Empty', categoryCount: 0, assignmentCount: 0 });
    expect(second?.grade.current).toBeNull();
  });

  it('returns a course in detail, assignments by due date with undated last', () => {
    const { service, course, assignment, clock } = setup();
    const c = course('Calc');
    assignment(c.id, { title: 'Undated', pointsPossible: 5 });
    clock.set('2026-10-02T16:00:00.000Z');
    assignment(c.id, { title: 'Later', pointsPossible: 5, dueAt: '2026-10-20T04:59:00.000Z' });
    assignment(c.id, { title: 'Sooner', pointsPossible: 5, dueAt: '2026-10-07T04:59:00.000Z' });

    const detail = service.getCourse(c.id);
    expect(detail.assignments.map((a) => a.title)).toEqual(['Sooner', 'Later', 'Undated']);
    expect(detail.course.id).toBe(c.id);
  });

  it('numbers categories in creation order per course', () => {
    const { service, course, category } = setup();
    const a = course('A');
    const b = course('B');
    category(a.id, 'One', 50);
    category(b.id, 'Other', 100);
    category(a.id, 'Two', 50);
    expect(service.getCourse(a.id).categories.map((c) => [c.name, c.position])).toEqual([
      ['One', 0],
      ['Two', 1],
    ]);
  });

  it('updates only the fields given', () => {
    const { service, course, assignment, clock } = setup();
    const c = course('Calc', { code: 'MATH 2413', term: 'Fall 2026' });
    clock.set('2026-10-03T10:00:00.000Z');
    const updated = service.updateCourse(
      courseUpdateSchema.parse({ id: c.id, name: 'Calculus I' }),
    );
    expect(updated).toMatchObject({
      name: 'Calculus I',
      code: 'MATH 2413',
      term: 'Fall 2026',
      createdAt: '2026-10-02T15:00:00.000Z',
      updatedAt: '2026-10-03T10:00:00.000Z',
    });

    const a = assignment(c.id, { pointsPossible: 20, pointsEarned: 18 });
    const cleared = service.updateAssignment(
      assignmentUpdateSchema.parse({ id: a.id, pointsEarned: null }),
    );
    expect(cleared).toMatchObject({ pointsPossible: 20, pointsEarned: null });
  });

  it('round-trips the letter scale and extra-credit flag', () => {
    const { service, course, assignment } = setup();
    const scale = [
      { letter: 'A', minPercent: 90 },
      { letter: 'F', minPercent: 0 },
    ];
    const c = course('Pass/fail-ish', { letterScale: scale, grading: 'points' });
    assignment(c.id, { pointsPossible: 5, extraCredit: true });
    const detail = service.getCourse(c.id);
    expect(detail.course.letterScale).toEqual(scale);
    expect(detail.assignments[0]?.extraCredit).toBe(true);
  });

  it('rejects a category from another course', () => {
    const { service, course, category, assignment } = setup();
    const a = course('A');
    const b = course('B');
    const foreign = category(b.id, 'Homework', 100);
    expect(() => assignment(a.id, { categoryId: foreign.id, pointsPossible: 1 })).toThrow(
      /different course/,
    );
    const ok = assignment(a.id, { pointsPossible: 1 });
    expect(() =>
      service.updateAssignment(assignmentUpdateSchema.parse({ id: ok.id, categoryId: foreign.id })),
    ).toThrow(/different course/);
  });

  it('keeps assignments (uncategorized) when their category is deleted', () => {
    const { service, course, category, assignment } = setup();
    const c = course('Calc');
    const hw = category(c.id, 'Homework', 100);
    const a = assignment(c.id, { categoryId: hw.id, pointsPossible: 10 });
    service.deleteCategory(hw.id);
    expect(service.getCourse(c.id).assignments).toEqual([{ ...a, categoryId: null }]);
  });

  it('deletes a course with everything in it', () => {
    const { database, service, course, category, assignment } = setup();
    const c = course('Calc');
    const hw = category(c.id, 'Homework', 100);
    assignment(c.id, { categoryId: hw.id, pointsPossible: 10 });
    service.deleteCourse(c.id);
    expect(service.listCourses()).toEqual([]);
    const counts = database.sqlite
      .prepare(
        'select (select count(*) from grade_category) as categories, (select count(*) from assignment) as assignments',
      )
      .get();
    expect(counts).toEqual({ categories: 0, assignments: 0 });
  });

  it('reports missing records clearly', () => {
    const { service } = setup();
    const id = '0b9d6c53-3c4e-4d84-9a4e-0f1d1c2b3a4f';
    expect(() => service.getCourse(id)).toThrow('Course not found');
    expect(() => service.deleteCategory(id)).toThrow('Grading category not found');
    expect(() => service.deleteAssignment(id)).toThrow('Assignment not found');
    expect(() =>
      service.createCategory(categoryCreateSchema.parse({ courseId: id, name: 'X' })),
    ).toThrow('Course not found');
  });
});
