import { describe, expect, it } from 'vitest';
import { DEFAULT_LETTER_SCALE } from '../grades/letter';
import {
  assignmentCreateSchema,
  assignmentUpdateSchema,
  courseCreateSchema,
  courseUpdateSchema,
} from './course';

const id = '0b9d6c53-3c4e-4d84-9a4e-0f1d1c2b3a4f';

describe('course schemas', () => {
  it('fills defaults on create', () => {
    expect(courseCreateSchema.parse({ name: ' MATH 2413 ' })).toEqual({
      name: 'MATH 2413',
      code: '',
      term: '',
      kind: 'enrolled',
      grading: 'weighted',
      letterScale: DEFAULT_LETTER_SCALE,
    });
  });

  it('applies no defaults on update, so untouched fields stay as they are', () => {
    expect(courseUpdateSchema.parse({ id, name: 'Calc I' })).toEqual({ id, name: 'Calc I' });
    expect(assignmentUpdateSchema.parse({ id, pointsEarned: null })).toEqual({
      id,
      pointsEarned: null,
    });
  });

  it('requires UTC instants for due dates', () => {
    const base = { courseId: id, title: 'HW 1', pointsPossible: 20 };
    expect(assignmentCreateSchema.parse({ ...base, dueAt: '2026-10-07T04:59:00.000Z' }).dueAt).toBe(
      '2026-10-07T04:59:00.000Z',
    );
    expect(() =>
      assignmentCreateSchema.parse({ ...base, dueAt: '2026-10-06T23:59:00-05:00' }),
    ).toThrow();
  });

  it('rejects bad colors and empty names', () => {
    expect(() => courseCreateSchema.parse({ name: '  ' })).toThrow();
    expect(() => courseCreateSchema.parse({ name: 'X', color: 'red' })).toThrow();
  });
});
