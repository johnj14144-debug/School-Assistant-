import { beforeAll, describe, expect, it } from 'vitest';

beforeAll(() => {
  // Houston. Node re-reads TZ when it changes.
  process.env.TZ = 'America/Chicago';
});

const {
  dueStatus,
  formatDue,
  formatTaskDue,
  fromDateAndTime,
  fromDateInput,
  fromDateTimeInput,
  guessTerm,
  isoFromLocal,
  pastTimeToIso,
  toDateInput,
  toDateTimeInput,
  toTimeInput,
} = await import('./dates');

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

  it('round-trips date-time inputs across the DST change', () => {
    expect(fromDateTimeInput('2026-11-01T01:30')).toBe('2026-11-01T06:30:00.000Z');
    expect(fromDateTimeInput('2026-11-02T01:30')).toBe('2026-11-02T07:30:00.000Z');
    for (const value of ['2026-03-08T09:05', '2026-11-01T23:59', '2026-10-07T00:00']) {
      expect(toDateTimeInput(fromDateTimeInput(value))).toBe(value);
    }
    expect(fromDateTimeInput('2026-10-07T')).toBeNull();
    expect(toDateTimeInput(null)).toBe('');
    expect(toTimeInput('2026-10-07T19:05:00.000Z')).toBe('14:05');
  });

  it('combines a date and an optional time; no time means 11:59 pm', () => {
    expect(fromDateAndTime('2026-10-07', '17:00')).toBe('2026-10-07T22:00:00.000Z');
    expect(fromDateAndTime('2026-10-07', '')).toBe('2026-10-08T04:59:00.000Z');
    expect(fromDateAndTime('', '17:00')).toBeNull();
  });

  it('says how a due date relates to now', () => {
    const now = new Date(2026, 9, 7, 15, 0); // Wed 3 pm
    expect(dueStatus(null, now)).toBe('none');
    expect(dueStatus(new Date(2026, 9, 7, 14, 0).toISOString(), now)).toBe('overdue');
    expect(dueStatus(new Date(2026, 9, 7, 23, 59).toISOString(), now)).toBe('today');
    expect(dueStatus(new Date(2026, 9, 13, 23, 59).toISOString(), now)).toBe('week');
    expect(dueStatus(new Date(2026, 9, 14, 0, 0).toISOString(), now)).toBe('later');
  });

  it('names nearby due days and shows a time unless it is 11:59 pm', () => {
    const now = new Date(2026, 9, 7, 15, 0);
    const at = (day: number, hour = 23, minute = 59) =>
      formatTaskDue(new Date(2026, 9, day, hour, minute).toISOString(), now);
    expect(at(7)).toBe('Today');
    expect(at(8, 17, 0)).toMatch(/^Tomorrow 5:00/);
    expect(at(6)).toBe('Yesterday');
    expect(at(9)).toMatch(/^Fri/);
    expect(at(20)).toMatch(/Oct 20/);
  });

  it('reads "I started at" times as the most recent such moment', () => {
    const now = new Date(2026, 9, 7, 0, 20); // 12:20 am
    expect(pastTimeToIso('00:05', now)).toBe(new Date(2026, 9, 7, 0, 5).toISOString());
    // 11:30 pm hasn't happened yet today, so it means last night.
    expect(pastTimeToIso('23:30', now)).toBe(new Date(2026, 9, 6, 23, 30).toISOString());
    expect(pastTimeToIso('', now)).toBeNull();
  });
});
