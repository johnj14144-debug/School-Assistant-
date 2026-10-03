import { addDays, dayNumber, isValidDate, type LocalDate, weekday } from './local-date';

/**
 * Recurrence rules for fixed events: the part of RFC 5545 RRULE a weekly routine needs, stored
 * as RRULE text ("FREQ=WEEKLY;BYDAY=MO,WE,FR;UNTIL=20261211"). Supported: FREQ=DAILY|WEEKLY,
 * INTERVAL, BYDAY (plain weekdays; a filter for DAILY), UNTIL (a local date, inclusive) and
 * COUNT. Weeks start on Monday. Dates are wall-clock dates in the event's zone.
 */

export const WEEKDAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;
export type WeekdayCode = (typeof WEEKDAY_CODES)[number];

export interface Recurrence {
  freq: 'daily' | 'weekly';
  /** Every n days or weeks. */
  interval: number;
  /** Weekdays, 0 = Sunday … 6 = Saturday, sorted. Weekly with none: the first day's weekday. */
  byDay: number[];
  /** Last day an occurrence may start on. */
  until: LocalDate | null;
  /** Number of occurrences, counted from the first day (skipped dates still count). */
  count: number | null;
}

export const MAX_INTERVAL = 52;
export const MAX_COUNT = 1000;

const UNTIL = /^(\d{4})(\d{2})(\d{2})(?:T\d{6}Z?)?$/;

/** Parses RRULE text; throws an Error that says what is wrong. */
export function parseRRule(text: string): Recurrence {
  const body = text.trim().replace(/^RRULE:/i, '');
  if (!body) throw new Error('The repeat rule is empty');
  const fields = new Map<string, string>();
  for (const part of body.split(';')) {
    const [key, value, extra] = part.split('=');
    if (!key || value === undefined || extra !== undefined || !value) {
      throw new Error(`Can't read "${part}" in the repeat rule`);
    }
    const name = key.toUpperCase();
    if (fields.has(name)) throw new Error(`${name} appears twice in the repeat rule`);
    fields.set(name, value.toUpperCase());
  }

  const freq = fields.get('FREQ');
  if (freq !== 'DAILY' && freq !== 'WEEKLY') {
    throw new Error('Only daily and weekly repeats are supported');
  }
  const rule: Recurrence = {
    freq: freq === 'DAILY' ? 'daily' : 'weekly',
    interval: 1,
    byDay: [],
    until: null,
    count: null,
  };
  for (const [name, value] of fields) {
    switch (name) {
      case 'FREQ':
        break;
      case 'INTERVAL':
        rule.interval = wholeNumber(value, 'INTERVAL', MAX_INTERVAL);
        break;
      case 'COUNT':
        rule.count = wholeNumber(value, 'COUNT', MAX_COUNT);
        break;
      case 'BYDAY': {
        const days = value.split(',').map((code) => {
          const day = WEEKDAY_CODES.indexOf(code as WeekdayCode);
          if (day < 0)
            throw new Error(`"${code}" is not a weekday (use MO, TU, WE, TH, FR, SA, SU)`);
          return day;
        });
        rule.byDay = [...new Set(days)].sort((a, b) => a - b);
        break;
      }
      case 'UNTIL': {
        const match = UNTIL.exec(value);
        const [year, month, day] = [Number(match?.[1]), Number(match?.[2]), Number(match?.[3])];
        if (!match || !isValidDate(year, month, day)) {
          throw new Error(`UNTIL must be a date like 20261211, not "${value}"`);
        }
        rule.until = { year, month, day };
        break;
      }
      case 'WKST':
        if (value !== 'MO') throw new Error('Weeks start on Monday (WKST=MO)');
        break;
      default:
        throw new Error(`${name} isn't supported in repeat rules`);
    }
  }
  if (rule.until && rule.count) throw new Error('Use UNTIL or COUNT, not both');
  return rule;
}

function wholeNumber(value: string, name: string, max: number): number {
  const n = Number(value);
  if (!/^\d+$/.test(value) || n < 1 || n > max) {
    throw new Error(`${name} must be a whole number from 1 to ${max}`);
  }
  return n;
}

/** The RRULE text for a rule (fields in a fixed order, defaults left out). */
export function formatRRule(rule: Recurrence): string {
  const parts = [`FREQ=${rule.freq === 'daily' ? 'DAILY' : 'WEEKLY'}`];
  if (rule.interval > 1) parts.push(`INTERVAL=${rule.interval}`);
  if (rule.byDay.length > 0) {
    // Monday first, as people read a week.
    const order = [...rule.byDay].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
    parts.push(`BYDAY=${order.map((d) => WEEKDAY_CODES[d]).join(',')}`);
  }
  if (rule.until) {
    const { year, month, day } = rule.until;
    parts.push(
      `UNTIL=${String(year).padStart(4, '0')}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}`,
    );
  }
  if (rule.count) parts.push(`COUNT=${rule.count}`);
  return parts.join(';');
}

/** Whether the RRULE text parses. */
export function rruleError(text: string): string | null {
  try {
    parseRRule(text);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

/** Day number of the Monday that starts `d`'s week. */
function weekStart(d: LocalDate): number {
  return dayNumber(d) - ((weekday(d) + 6) % 7);
}

/** Whether the pattern (ignoring UNTIL and COUNT) puts an occurrence on `date`. */
function matches(rule: Recurrence, first: LocalDate, date: LocalDate): boolean {
  const offset = dayNumber(date) - dayNumber(first);
  if (offset < 0) return false;
  if (rule.freq === 'daily') {
    return (
      offset % rule.interval === 0 &&
      (rule.byDay.length === 0 || rule.byDay.includes(weekday(date)))
    );
  }
  const days = rule.byDay.length > 0 ? rule.byDay : [weekday(first)];
  if (!days.includes(weekday(date))) return false;
  return ((weekStart(date) - weekStart(first)) / 7) % rule.interval === 0;
}

/** The last day an occurrence may start on, from UNTIL or COUNT; null = forever. */
function lastDay(rule: Recurrence, first: LocalDate): LocalDate | null {
  if (rule.until) return rule.until;
  if (!rule.count) return null;
  let seen = 0;
  for (let d = first; ; d = addDays(d, 1)) {
    if (matches(rule, first, d) && ++seen === rule.count) return d;
  }
}

/**
 * Dates from `from` to `to` (inclusive) on which an occurrence starts. `rule` null means a
 * one-time event on `first`.
 */
export function occurrenceDates(
  rule: Recurrence | null,
  first: LocalDate,
  from: LocalDate,
  to: LocalDate,
): LocalDate[] {
  if (!rule) {
    const n = dayNumber(first);
    return n >= dayNumber(from) && n <= dayNumber(to) ? [first] : [];
  }
  const last = lastDay(rule, first);
  const end = last && dayNumber(last) < dayNumber(to) ? last : to;
  const start = dayNumber(from) > dayNumber(first) ? from : first;
  const dates: LocalDate[] = [];
  for (let d = start; dayNumber(d) <= dayNumber(end); d = addDays(d, 1)) {
    if (matches(rule, first, d)) dates.push(d);
  }
  return dates;
}
