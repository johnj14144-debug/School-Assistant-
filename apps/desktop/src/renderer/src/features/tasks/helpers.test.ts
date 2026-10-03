import { beforeAll, describe, expect, it } from 'vitest';

beforeAll(() => {
  process.env.TZ = 'America/Chicago';
});

const { quantityText, singularUnit } = await import('./format');
const { createInput, parseLine } = await import('./quickAdd');
const { moveId } = await import('../today/order');
const { matchesQuery } = await import('../palette/match');

const courses = [{ id: '0b9d6c53-3c4e-4d84-9a4e-0f1d1c2b3a4f', code: 'MATH 2413', name: 'Calc' }];

describe('task helpers', () => {
  it('writes quantities with a singular for one', () => {
    expect(quantityText(12, 'problems')).toBe('12 problems');
    expect(quantityText(1, 'pages')).toBe('1 page');
    expect(quantityText(2.5, '')).toBe('2.5');
    expect(quantityText(null, 'pages')).toBe('');
    expect(singularUnit('problems')).toBe('problem');
    expect(singularUnit('')).toBe('');
  });

  it('turns a quick-add line into a task, leaving untyped fields to the parent', () => {
    const now = new Date(2026, 9, 7, 15, 0);
    const parsed = parseLine('Calc HW fri 5pm ~1h #math @homework', courses, now);
    expect(createInput(parsed, { today: true })).toEqual({
      title: 'Calc HW',
      dueAt: '2026-10-09T22:00:00.000Z',
      estimateMin: 60,
      quantity: null,
      unit: '',
      courseId: courses[0]?.id,
      type: 'homework',
      today: true,
    });
    const plain = createInput(parseLine('Outline', courses, now), { parentId: 'p' });
    expect(plain).not.toHaveProperty('courseId');
    expect(plain).not.toHaveProperty('type');
    expect(plain).not.toHaveProperty('priority');
  });

  it('moves an id within a list', () => {
    expect(moveId(['a', 'b', 'c'], 'c', 0)).toEqual(['c', 'a', 'b']);
    expect(moveId(['a', 'b', 'c'], 'a', 2)).toEqual(['b', 'c', 'a']);
    expect(moveId(['a', 'b', 'c'], 'b', 9)).toEqual(['a', 'c', 'b']);
  });

  it('matches every word of a search, in any order', () => {
    expect(matchesQuery('Calc HW 3 MATH 2413', 'hw calc')).toBe(true);
    expect(matchesQuery('Calc HW 3', 'calc essay')).toBe(false);
    expect(matchesQuery('Anything', '  ')).toBe(true);
  });
});
