import { describe, expect, it } from 'vitest';
import {
  defaultDue,
  sessionUpdateSchema,
  taskCompleteSchema,
  taskCreateSchema,
  taskUpdateSchema,
} from './schemas';

const id = '0b9d6c53-3c4e-4d84-9a4e-0f1d1c2b3a4f';

describe('task schemas', () => {
  it('fills defaults on create, leaving course and type to the parent', () => {
    expect(taskCreateSchema.parse({ title: ' Calc HW 3 ' })).toEqual({
      title: 'Calc HW 3',
      parentId: null,
      description: '',
      assignmentId: null,
      quantity: null,
      unit: '',
      estimateMin: null,
      priority: 'normal',
      attention: 'focus',
      earliestStartAt: null,
      splittable: true,
      minChunkMin: 30,
      steps: [],
      today: false,
    });
  });

  it('makes a due date a week out (or today) when none is given', () => {
    const today = { year: 2026, month: 12, day: 28 };
    expect(defaultDue(today, false)).toEqual({
      year: 2027,
      month: 1,
      day: 4,
      hour: 23,
      minute: 59,
    });
    expect(defaultDue(today, true)).toEqual({ ...today, hour: 23, minute: 59 });
  });

  it('never clears a due date', () => {
    expect(() => taskUpdateSchema.parse({ id, dueAt: null })).toThrow();
    expect(() => taskCreateSchema.parse({ title: 'x', deadline: 'maybe' })).toThrow();
  });

  it('applies no defaults on update', () => {
    expect(taskUpdateSchema.parse({ id, estimateMin: null })).toEqual({ id, estimateMin: null });
    expect(sessionUpdateSchema.parse({ id })).toEqual({ id });
  });

  it('rejects bad values', () => {
    expect(() => taskCreateSchema.parse({ title: '' })).toThrow();
    expect(() => taskCreateSchema.parse({ title: 'x', estimateMin: 1.5 })).toThrow();
    expect(() => taskCreateSchema.parse({ title: 'x', priority: 'urgent' })).toThrow();
    expect(() => taskCreateSchema.parse({ title: 'x', dueAt: '2026-10-07' })).toThrow();
    expect(() => taskCreateSchema.parse({ title: 'x', minChunkMin: 0 })).toThrow();
    expect(() =>
      taskCreateSchema.parse({ title: 'x', steps: [{ title: 'Fold', minutes: 0, wait: false }] }),
    ).toThrow();
  });

  it('trims the completion note', () => {
    expect(taskCompleteSchema.parse({ id, note: '  did 1–12 \n' })).toEqual({
      id,
      note: 'did 1–12',
    });
    expect(taskCompleteSchema.parse({ id })).toEqual({ id, note: '' });
  });
});
