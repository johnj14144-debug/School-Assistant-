import { beforeAll, describe, expect, it } from 'vitest';

beforeAll(() => {
  // Houston. Node re-reads TZ when it changes.
  process.env.TZ = 'America/Chicago';
});

const { formatDue, fromDateInput, guessTerm, isoFromLocal, toDateInput } = await import('./dates');

describe('renderer date helpers', () => {
  it('stores a date-only due date as 11:59 pm local, in UTC', () => {
    // October is daylight time (UTC−5); after the first Sunday of November it's UTC−6.
    expect(fromDateInput('2026-10-07')).toBe('2026-10-08T04:59:00.000Z');
    expect(fromDateInput('2026-11-02')).toBe('2026-11-03T05:59:00.000Z');
    expect(fromDateInput('')).toBeNull();
  });

  it('keeps the existing time of day when only the date changes', () => {
    const twoPm = isoFromLocal({ year: 2026, month: 10, day: 14, hour: 14, minute: 0 });
    expect(fromDateInput('2026-10-21', twoPm)).toBe('2026-10-21T19:00:00.000Z');
  });

  it('round-trips through the date input across a DST change', () => {
    for (const day of ['2026-03-08', '2026-03-09', '2026-11-01', '2026-11-02']) {
      expect(toDateInput(fromDateInput(day))).toBe(day);
    }
    expect(toDateInput(null)).toBe('');
  });

  it('shows the time only when it is not the end of the day', () => {
    const now = new Date('2026-10-02T12:00:00Z');
    expect(formatDue(fromDateInput('2026-10-07'), now)).not.toMatch(/\d:\d\d/);
    const twoPm = isoFromLocal({ year: 2026, month: 10, day: 14, hour: 14, minute: 0 });
    expect(formatDue(twoPm, now)).toMatch(/2:00/);
    expect(formatDue(fromDateInput('2027-01-20'), now)).toMatch(/2027/);
  });

  it('guesses the UH term', () => {
    expect(guessTerm(new Date(2026, 9, 2))).toBe('Fall 2026');
    expect(guessTerm(new Date(2027, 0, 15))).toBe('Spring 2027');
    expect(guessTerm(new Date(2027, 5, 15))).toBe('Summer 2027');
  });
});
