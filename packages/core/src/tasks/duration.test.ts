import { describe, expect, it } from 'vitest';
import { formatClock, formatMinutes, parseDuration } from './duration';

describe('parseDuration', () => {
  it.each([
    ['45', 45],
    ['45m', 45],
    ['45 min', 45],
    ['45 minutes', 45],
    ['1h', 60],
    ['1.5h', 90],
    ['2 hours', 120],
    ['1 hr', 60],
    ['1h30', 90],
    ['1h 30m', 90],
    ['1 h 30 min', 90],
    ['1:05', 65],
    [' 90 ', 90],
    ['0.25h', 15],
  ])('%s → %i minutes', (text, minutes) => {
    expect(parseDuration(text)).toBe(minutes);
  });

  it.each(['', '  ', 'soon', '1:75', 'h', '-5', '1h30h'])('%j is not a duration', (text) => {
    expect(parseDuration(text)).toBeNull();
  });
});

describe('formatMinutes', () => {
  it('rounds to the minute and drops empty parts', () => {
    expect(formatMinutes(0)).toBe('0m');
    expect(formatMinutes(44.6)).toBe('45m');
    expect(formatMinutes(60)).toBe('1h');
    expect(formatMinutes(95)).toBe('1h 35m');
    expect(formatMinutes(-3)).toBe('0m');
  });
});

describe('formatClock', () => {
  it('shows minutes:seconds, with hours once there are any', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(245.9)).toBe('4:05');
    expect(formatClock(3729)).toBe('1:02:09');
  });
});
