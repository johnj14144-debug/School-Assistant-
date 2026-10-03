import { describe, expect, it } from 'vitest';
import { numberText, parseAmount, parseScore, parseWholeNumber } from './cells';

describe('cell parsing', () => {
  it('reads scores, with an optional points possible', () => {
    expect(parseScore('')).toEqual({ pointsEarned: null });
    expect(parseScore(' — ')).toEqual({ pointsEarned: null });
    expect(parseScore('18')).toEqual({ pointsEarned: 18 });
    expect(parseScore('9.5')).toEqual({ pointsEarned: 9.5 });
    expect(parseScore('18 / 20')).toEqual({ pointsEarned: 18, pointsPossible: 20 });
    expect(() => parseScore('abc')).toThrow('The score must be a number');
    expect(() => parseScore('-3')).toThrow('The score must be a number');
    expect(() => parseScore('18/')).toThrow('The points possible must be a number');
  });

  it('reads amounts and whole numbers', () => {
    expect(parseAmount('20')).toBe(20);
    expect(parseAmount('.5')).toBe(0.5);
    expect(() => parseAmount('', 'Weight')).toThrow('Weight must be a number');
    expect(parseWholeNumber('')).toBe(0);
    expect(parseWholeNumber('3')).toBe(3);
    expect(() => parseWholeNumber('1.5', 'Drop lowest')).toThrow('must be a whole number');
  });

  it('prints numbers without float noise', () => {
    expect(numberText(null)).toBe('');
    expect(numberText(18)).toBe('18');
    expect(numberText(0.1 + 0.2)).toBe('0.3');
  });
});
