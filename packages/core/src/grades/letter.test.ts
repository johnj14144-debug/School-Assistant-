import { describe, expect, it } from 'vitest';
import { DEFAULT_LETTER_SCALE, letterFor, percent } from './letter';

describe('percent', () => {
  it('computes earned over possible', () => {
    expect(percent(45, 50)).toBe(90);
  });

  it('allows extra credit above 100', () => {
    expect(percent(55, 50)).toBe(110);
  });

  it('returns null when nothing is graded', () => {
    expect(percent(0, 0)).toBeNull();
  });
});

describe('letterFor', () => {
  it('uses inclusive cutoffs', () => {
    expect(letterFor(93)).toBe('A');
    expect(letterFor(92.99)).toBe('A-');
    expect(letterFor(60)).toBe('D-');
    expect(letterFor(59.9)).toBe('F');
  });

  it('handles a custom, unsorted scale', () => {
    const scale = [
      { letter: 'B', minPercent: 80 },
      { letter: 'A', minPercent: 90 },
      { letter: 'C', minPercent: 70 },
    ];
    expect(letterFor(85, scale)).toBe('B');
    expect(letterFor(95, scale)).toBe('A');
  });

  it('gives the lowest letter when below every cutoff', () => {
    const scale = [
      { letter: 'A', minPercent: 90 },
      { letter: 'B', minPercent: 80 },
    ];
    expect(letterFor(50, scale)).toBe('B');
  });

  it('rejects an empty scale', () => {
    expect(() => letterFor(90, [])).toThrow();
  });

  it('default scale ends at F from 0', () => {
    expect(DEFAULT_LETTER_SCALE.at(-1)).toEqual({ letter: 'F', minPercent: 0 });
  });
});
