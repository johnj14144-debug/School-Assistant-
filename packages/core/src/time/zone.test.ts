import { describe, expect, it } from 'vitest';
import { fromZoned, isValidTimeZone, startOfZonedDay, toZoned, zoneOffsetMinutes } from './zone';

const HOUSTON = 'America/Chicago';
const iso = (ms: number) => new Date(ms).toISOString();
const at = (text: string) => Date.parse(text);

describe('zoneOffsetMinutes / toZoned', () => {
  it('follows daylight saving time in Houston', () => {
    expect(zoneOffsetMinutes(at('2026-07-01T12:00:00Z'), HOUSTON)).toBe(-300);
    expect(zoneOffsetMinutes(at('2026-12-01T12:00:00Z'), HOUSTON)).toBe(-360);
    expect(zoneOffsetMinutes(at('2026-07-01T12:00:00Z'), 'UTC')).toBe(0);
    expect(zoneOffsetMinutes(at('2026-07-01T12:00:00Z'), 'Asia/Kolkata')).toBe(330);
  });

  it('changes at 2 am local on the second Sunday of March and the first Sunday of November', () => {
    // 2026-03-08 02:00 CST = 08:00Z; 2026-11-01 02:00 CDT = 07:00Z.
    expect(zoneOffsetMinutes(at('2026-03-08T07:59:00Z'), HOUSTON)).toBe(-360);
    expect(zoneOffsetMinutes(at('2026-03-08T08:00:00Z'), HOUSTON)).toBe(-300);
    expect(zoneOffsetMinutes(at('2026-11-01T06:59:00Z'), HOUSTON)).toBe(-300);
    expect(zoneOffsetMinutes(at('2026-11-01T07:00:00Z'), HOUSTON)).toBe(-360);
  });

  it('reads the wall clock at an instant', () => {
    expect(toZoned(at('2026-10-07T15:30:45.500Z'), HOUSTON)).toEqual({
      year: 2026,
      month: 10,
      day: 7,
      hour: 10,
      minute: 30,
    });
    // Just after midnight UTC is still the previous evening in Houston.
    expect(toZoned(at('2027-01-01T03:00:00Z'), HOUSTON)).toMatchObject({
      year: 2026,
      month: 12,
      day: 31,
      hour: 21,
    });
    expect(toZoned(at('2026-11-01T06:30:00Z'), HOUSTON)).toMatchObject({ hour: 1, minute: 30 });
    expect(toZoned(at('2026-11-01T07:30:00Z'), HOUSTON)).toMatchObject({ hour: 1, minute: 30 });
  });
});

describe('fromZoned', () => {
  const local = (y: number, mo: number, d: number, h: number, mi = 0) => ({
    year: y,
    month: mo,
    day: d,
    hour: h,
    minute: mi,
  });

  it('turns ordinary wall-clock times into instants on both sides of a change', () => {
    expect(iso(fromZoned(local(2026, 3, 7, 10), HOUSTON))).toBe('2026-03-07T16:00:00.000Z');
    expect(iso(fromZoned(local(2026, 3, 9, 10), HOUSTON))).toBe('2026-03-09T15:00:00.000Z');
    expect(iso(fromZoned(local(2026, 10, 31, 23), HOUSTON))).toBe('2026-11-01T04:00:00.000Z');
    expect(iso(fromZoned(local(2026, 11, 2, 6, 30), HOUSTON))).toBe('2026-11-02T12:30:00.000Z');
  });

  it('moves a time skipped in March forward by the gap', () => {
    expect(iso(fromZoned(local(2026, 3, 8, 2, 30), HOUSTON))).toBe('2026-03-08T08:30:00.000Z');
    expect(toZoned(fromZoned(local(2026, 3, 8, 2, 30), HOUSTON), HOUSTON)).toMatchObject({
      hour: 3,
      minute: 30,
    });
    // Times next to the gap are exact.
    expect(iso(fromZoned(local(2026, 3, 8, 1, 59), HOUSTON))).toBe('2026-03-08T07:59:00.000Z');
    expect(iso(fromZoned(local(2026, 3, 8, 3, 0), HOUSTON))).toBe('2026-03-08T08:00:00.000Z');
  });

  it('takes the first of the two 1:30s in November', () => {
    expect(iso(fromZoned(local(2026, 11, 1, 1, 30), HOUSTON))).toBe('2026-11-01T06:30:00.000Z');
    expect(iso(fromZoned(local(2026, 11, 1, 2, 0), HOUSTON))).toBe('2026-11-01T08:00:00.000Z');
  });

  it('round-trips every 15 minutes across both 2026 changes', () => {
    for (const start of ['2026-03-07T00:00:00Z', '2026-10-31T00:00:00Z']) {
      for (let ms = at(start); ms < at(start) + 3 * 86_400_000; ms += 15 * 60_000) {
        const back = fromZoned(toZoned(ms, HOUSTON), HOUSTON);
        // Only the repeated hour in November maps back to its first occurrence.
        if (back !== ms) expect(ms - back).toBe(3_600_000);
      }
    }
  });

  it('works in zones without daylight saving and with half-hour offsets', () => {
    expect(iso(fromZoned(local(2026, 3, 8, 2, 30), 'UTC'))).toBe('2026-03-08T02:30:00.000Z');
    expect(iso(fromZoned(local(2026, 3, 8, 9, 0), 'Asia/Kolkata'))).toBe(
      '2026-03-08T03:30:00.000Z',
    );
    // Europe changes on a different weekend (last Sunday of March, 01:00 UTC).
    expect(iso(fromZoned(local(2026, 3, 29, 2, 30), 'Europe/Berlin'))).toBe(
      '2026-03-29T01:30:00.000Z',
    );
  });
});

describe('startOfZonedDay', () => {
  it('finds local midnight, including on the days the clocks change', () => {
    expect(iso(startOfZonedDay(at('2026-10-07T15:00:00Z'), HOUSTON))).toBe(
      '2026-10-07T05:00:00.000Z',
    );
    // 23:30 UTC on Mar 7 is 5:30 pm Houston, still Mar 7 (CST).
    expect(iso(startOfZonedDay(at('2026-03-07T23:30:00Z'), HOUSTON))).toBe(
      '2026-03-07T06:00:00.000Z',
    );
    expect(iso(startOfZonedDay(at('2026-11-01T20:00:00Z'), HOUSTON))).toBe(
      '2026-11-01T05:00:00.000Z',
    );
  });
});

describe('isValidTimeZone', () => {
  it('accepts IANA zones and rejects anything else', () => {
    expect(isValidTimeZone(HOUSTON)).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('America/Houston')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
    expect(isValidTimeZone('Not/AZone')).toBe(false);
  });
});
