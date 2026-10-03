import { describe, expect, it } from 'vitest';
import { formatLocalDate, type LocalDate, parseLocalDate } from './local-date';
import { formatRRule, occurrenceDates, parseRRule, rruleError } from './recurrence';

const d = (text: string): LocalDate => {
  const date = parseLocalDate(text);
  if (!date) throw new Error(`bad date ${text}`);
  return date;
};
const dates = (rrule: string | null, first: string, from: string, to: string) =>
  occurrenceDates(rrule ? parseRRule(rrule) : null, d(first), d(from), d(to)).map(formatLocalDate);

describe('parseRRule / formatRRule', () => {
  it('reads the supported fields', () => {
    expect(parseRRule('FREQ=WEEKLY;BYDAY=MO,WE,FR;UNTIL=20261211')).toEqual({
      freq: 'weekly',
      interval: 1,
      byDay: [1, 3, 5],
      until: { year: 2026, month: 12, day: 11 },
      count: null,
    });
    expect(parseRRule('RRULE:freq=daily;interval=2;count=10')).toMatchObject({
      freq: 'daily',
      interval: 2,
      count: 10,
    });
    // A UTC UNTIL from another calendar app keeps its date.
    expect(parseRRule('FREQ=WEEKLY;UNTIL=20261211T055959Z').until).toEqual({
      year: 2026,
      month: 12,
      day: 11,
    });
  });

  it('writes RRULE text in a stable order, Monday first', () => {
    expect(formatRRule(parseRRule('BYDAY=SU,TU;FREQ=WEEKLY;INTERVAL=1'))).toBe(
      'FREQ=WEEKLY;BYDAY=TU,SU',
    );
    expect(formatRRule(parseRRule('FREQ=DAILY;COUNT=5;INTERVAL=3'))).toBe(
      'FREQ=DAILY;INTERVAL=3;COUNT=5',
    );
    expect(formatRRule(parseRRule('FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20270105'))).toBe(
      'FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20270105',
    );
  });

  it('explains what it does not support', () => {
    expect(rruleError('FREQ=MONTHLY')).toMatch(/daily and weekly/);
    expect(rruleError('FREQ=WEEKLY;BYDAY=1MO')).toMatch(/not a weekday/);
    expect(rruleError('FREQ=WEEKLY;BYMONTH=3')).toMatch(/BYMONTH isn't supported/);
    expect(rruleError('FREQ=WEEKLY;UNTIL=20260231')).toMatch(/UNTIL must be a date/);
    expect(rruleError('FREQ=WEEKLY;COUNT=3;UNTIL=20261211')).toMatch(/not both/);
    expect(rruleError('FREQ=DAILY;INTERVAL=0')).toMatch(/whole number/);
    expect(rruleError('FREQ=DAILY;FREQ=WEEKLY')).toMatch(/twice/);
    expect(rruleError('FREQ=WEEKLY;WKST=SU')).toMatch(/Monday/);
    expect(rruleError('')).toMatch(/empty/);
    expect(rruleError('FREQ=WEEKLY;BYDAY=MO,WE')).toBeNull();
  });
});

describe('occurrenceDates', () => {
  it('repeats a MWF class until the last day of classes', () => {
    // Fall 2026 starts Monday Aug 24.
    expect(
      dates('FREQ=WEEKLY;BYDAY=MO,WE,FR;UNTIL=20261209', '2026-08-24', '2026-08-20', '2026-08-30'),
    ).toEqual(['2026-08-24', '2026-08-26', '2026-08-28']);
    expect(
      dates('FREQ=WEEKLY;BYDAY=MO,WE,FR;UNTIL=20261209', '2026-08-24', '2026-12-07', '2026-12-14'),
    ).toEqual(['2026-12-07', '2026-12-09']);
  });

  it('starts on the first day even if that weekday comes later in the week', () => {
    // First day Wednesday: that week's Monday is skipped.
    expect(dates('FREQ=WEEKLY;BYDAY=MO,WE', '2026-08-26', '2026-08-24', '2026-09-02')).toEqual([
      '2026-08-26',
      '2026-08-31',
      '2026-09-02',
    ]);
  });

  it('uses the first day’s weekday when BYDAY is left out', () => {
    expect(dates('FREQ=WEEKLY', '2026-10-06', '2026-10-01', '2026-10-25')).toEqual([
      '2026-10-06',
      '2026-10-13',
      '2026-10-20',
    ]);
  });

  it('skips weeks for INTERVAL, counting from the first day’s Monday-start week', () => {
    expect(
      dates('FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,SU', '2026-10-06', '2026-10-01', '2026-10-31'),
    ).toEqual(['2026-10-06', '2026-10-11', '2026-10-20', '2026-10-25']);
    expect(dates('FREQ=DAILY;INTERVAL=3', '2026-10-01', '2026-10-05', '2026-10-12')).toEqual([
      '2026-10-07',
      '2026-10-10',
    ]);
  });

  it('treats BYDAY as a filter for daily rules (weekday breakfast)', () => {
    expect(
      dates('FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR', '2026-10-01', '2026-10-02', '2026-10-06'),
    ).toEqual(['2026-10-02', '2026-10-05', '2026-10-06']);
  });

  it('stops after COUNT occurrences', () => {
    expect(
      dates('FREQ=WEEKLY;BYDAY=TU,TH;COUNT=3', '2026-10-06', '2026-10-01', '2026-12-31'),
    ).toEqual(['2026-10-06', '2026-10-08', '2026-10-13']);
    // A window after the last occurrence is empty.
    expect(dates('FREQ=DAILY;COUNT=2', '2026-10-06', '2026-10-10', '2026-10-20')).toEqual([]);
  });

  it('has one date for a one-time event, inside the window only', () => {
    expect(dates(null, '2026-10-09', '2026-10-05', '2026-10-11')).toEqual(['2026-10-09']);
    expect(dates(null, '2026-10-09', '2026-10-10', '2026-10-11')).toEqual([]);
  });

  it('is empty before the first day', () => {
    expect(dates('FREQ=DAILY', '2026-10-09', '2026-10-01', '2026-10-08')).toEqual([]);
  });
});
