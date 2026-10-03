import {
  addDays,
  formatLocalDate,
  type LocalDate,
  minuteOfDay,
  parseLocalDate,
  parseLocalTime,
} from './local-date';
import { occurrenceDates, parseRRule, type Recurrence } from './recurrence';
import { fromZoned, toZoned } from './zone';

/**
 * Recurring fixed events → concrete UTC intervals (ADR 0007), and the free time between them
 * that the planner may use. Everything here is wall-clock time in each event's own zone, so a
 * 10:00 class stays at 10:00 across daylight-saving changes.
 */

/** The 7.5-hour sleep floor (VISION: protected no matter what). */
export const SLEEP_FLOOR_MIN = 450;

const MINUTE_MS = 60_000;

/** The parts of a fixed event that decide when it happens. */
export interface RecurringEvent {
  kind?: string;
  startDate: string;
  startLocal: string;
  endLocal: string;
  rrule: string | null;
  timeZone: string;
  exceptions: readonly string[];
}

export interface Occurrence<E> {
  event: E;
  /** Local date (event zone) the occurrence starts on, `YYYY-MM-DD`. */
  date: string;
  /** UTC ISO instants. */
  startAt: string;
  endAt: string;
  /** Minutes added to the end of a sleep shorter than the floor (the spring-forward night). */
  extendedMin: number;
}

export interface ExpandOptions {
  /** Sleep occurrences shorter than this are lengthened at the end. Default 450. */
  sleepFloorMin?: number;
}

/** Wall-clock length of an event in minutes; an end at or before the start is the next day. */
export function wallMinutes(startLocal: string, endLocal: string): number {
  const start = parseLocalTime(startLocal);
  const end = parseLocalTime(endLocal);
  if (!start || !end) return 0;
  const minutes = minuteOfDay(end) - minuteOfDay(start);
  return minutes > 0 ? minutes : minutes + 1440;
}

const toMs = (t: Date | string) => (typeof t === 'string' ? Date.parse(t) : t.getTime());

function localDateAt(ms: number, timeZone: string): LocalDate {
  const { year, month, day } = toZoned(ms, timeZone);
  return { year, month, day };
}

interface Parsed {
  rule: Recurrence | null;
  first: LocalDate;
  start: { hour: number; minute: number };
  end: { hour: number; minute: number };
  overnight: boolean;
}

/** null for stored data that doesn't parse (it was validated on write; skip rather than crash). */
function parse(event: RecurringEvent): Parsed | null {
  const first = parseLocalDate(event.startDate);
  const start = parseLocalTime(event.startLocal);
  const end = parseLocalTime(event.endLocal);
  if (!first || !start || !end) return null;
  try {
    const rule = event.rrule ? parseRRule(event.rrule) : null;
    toZoned(0, event.timeZone);
    return { rule, first, start, end, overnight: minuteOfDay(end) <= minuteOfDay(start) };
  } catch {
    return null;
  }
}

/**
 * Every occurrence that overlaps [from, to), sorted by start. Skipped dates are left out. Sleep
 * shorter than the floor in real time (23:00–06:30 on the night clocks spring forward is 6.5 h)
 * is extended at the end, so the floor holds every night.
 */
export function expandFixedEvents<E extends RecurringEvent>(
  events: readonly E[],
  from: Date | string,
  to: Date | string,
  options: ExpandOptions = {},
): Occurrence<E>[] {
  const fromMs = toMs(from);
  const toMsValue = toMs(to);
  const floor = options.sleepFloorMin ?? SLEEP_FLOOR_MIN;
  const result: Occurrence<E>[] = [];
  for (const event of events) {
    const parsed = parse(event);
    if (!parsed) continue;
    const { rule, first, start, end, overnight } = parsed;
    const skipped = new Set(event.exceptions);
    // An occurrence that starts the day before (overnight) can reach into the window.
    const firstDay = addDays(localDateAt(fromMs, event.timeZone), -1);
    const lastDay = localDateAt(toMsValue, event.timeZone);
    for (const date of occurrenceDates(rule, first, firstDay, lastDay)) {
      const key = formatLocalDate(date);
      if (skipped.has(key)) continue;
      const startMs = fromZoned({ ...date, ...start }, event.timeZone);
      let endMs = fromZoned({ ...(overnight ? addDays(date, 1) : date), ...end }, event.timeZone);
      if (endMs <= startMs) continue;
      let extendedMin = 0;
      if (event.kind === 'sleep' && endMs - startMs < floor * MINUTE_MS) {
        extendedMin = Math.round(floor - (endMs - startMs) / MINUTE_MS);
        endMs = startMs + floor * MINUTE_MS;
      }
      if (startMs >= toMsValue || endMs <= fromMs) continue;
      result.push({
        event,
        date: key,
        startAt: new Date(startMs).toISOString(),
        endAt: new Date(endMs).toISOString(),
        extendedMin,
      });
    }
  }
  return result.sort((a, b) => a.startAt.localeCompare(b.startAt));
}

export interface Interval {
  /** UTC ISO instants, half-open [startAt, endAt). */
  startAt: string;
  endAt: string;
}

/** [from, to) minus the busy intervals: the free stretches, in order. */
export function freeIntervals(
  from: Date | string,
  to: Date | string,
  busy: readonly Interval[],
): Interval[] {
  const toMsValue = toMs(to);
  const spans = busy
    .map((b) => [Date.parse(b.startAt), Date.parse(b.endAt)] as const)
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0]);
  const free: Interval[] = [];
  let cursor = toMs(from);
  for (const [start, end] of spans) {
    if (cursor >= toMsValue) break;
    if (start > cursor) {
      free.push({
        startAt: new Date(cursor).toISOString(),
        endAt: new Date(Math.min(start, toMsValue)).toISOString(),
      });
    }
    cursor = Math.max(cursor, end);
  }
  if (cursor < toMsValue) {
    free.push({
      startAt: new Date(cursor).toISOString(),
      endAt: new Date(toMsValue).toISOString(),
    });
  }
  return free;
}

/**
 * The time in [from, to) not taken by any fixed event (classes, sleep with its floor, meals,
 * hygiene, other): what the scheduler may fill (M5).
 */
export function availability(
  events: readonly RecurringEvent[],
  from: Date | string,
  to: Date | string,
  options: ExpandOptions = {},
): Interval[] {
  return freeIntervals(from, to, expandFixedEvents(events, from, to, options));
}

/**
 * Local dates in `timeZone` (the laptop's, as the calendar shows them) from `from` up to `to`
 * on which no sleep occurrence starts: nights the floor can't protect because the routine has
 * no sleep for them.
 */
export function nightsWithoutSleep(
  occurrences: readonly Occurrence<RecurringEvent>[],
  from: Date | string,
  to: Date | string,
  timeZone: string,
): string[] {
  const sleepDates = new Set(
    occurrences
      .filter((o) => o.event.kind === 'sleep')
      .map((o) => formatLocalDate(localDateAt(Date.parse(o.startAt), timeZone))),
  );
  const missing: string[] = [];
  const last = formatLocalDate(localDateAt(toMs(to) - 1, timeZone));
  for (let d = localDateAt(toMs(from), timeZone); ; d = addDays(d, 1)) {
    const key = formatLocalDate(d);
    if (!sleepDates.has(key)) missing.push(key);
    if (key >= last) break;
  }
  return missing;
}
