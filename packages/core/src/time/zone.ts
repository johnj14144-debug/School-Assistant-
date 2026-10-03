import type { LocalDateTime } from './local-date';

/**
 * Conversions between UTC instants and wall-clock time in an IANA zone (ADR 0007), built on
 * `Intl.DateTimeFormat` because `Temporal` isn't in Node 22. Never do arithmetic on local time
 * with `Date`: convert to an instant first.
 */

/** Houston (owner decision Q6). Fixed events keep their own zone; display follows the laptop. */
export const DEFAULT_TIME_ZONE = 'America/Chicago';

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

/** Whether `timeZone` is an IANA zone this runtime knows ("America/Chicago", "UTC"). */
export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone) return false;
  try {
    formatter(timeZone);
    return true;
  } catch {
    return false;
  }
}

interface Parts extends LocalDateTime {
  second: number;
}

function zonedParts(ms: number, timeZone: string): Parts {
  const parts: Record<string, number> = {};
  for (const { type, value } of formatter(timeZone).formatToParts(ms)) {
    if (type !== 'literal') parts[type] = Number(value);
  }
  return {
    year: parts.year ?? 0,
    month: parts.month ?? 0,
    day: parts.day ?? 0,
    hour: parts.hour ?? 0,
    minute: parts.minute ?? 0,
    second: parts.second ?? 0,
  };
}

/** The zone's offset from UTC at an instant, in minutes (Houston: -300 in summer, -360 in winter). */
export function zoneOffsetMinutes(ms: number, timeZone: string): number {
  const p = zonedParts(ms, timeZone);
  const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((wall - Math.floor(ms / 1000) * 1000) / MINUTE_MS);
}

/** The wall-clock date and time in `timeZone` at an instant (seconds dropped). */
export function toZoned(ms: number, timeZone: string): LocalDateTime {
  const { second: _, ...local } = zonedParts(ms, timeZone);
  return local;
}

/**
 * The instant when the wall clock in `timeZone` shows `local`. Like Temporal's `compatible`
 * disambiguation: a time skipped by a spring-forward change moves later by the gap (2:30 →
 * 3:30), and a time that happens twice in the fall takes the first (daylight) one.
 */
export function fromZoned(local: LocalDateTime, timeZone: string): number {
  const wall = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute);
  // The offsets just before and after any change near this time.
  const before = zoneOffsetMinutes(wall - DAY_MS, timeZone);
  const after = zoneOffsetMinutes(wall + DAY_MS, timeZone);
  const valid = [...new Set([before, after])]
    .map((offset) => wall - offset * MINUTE_MS)
    .filter((ms) => zoneOffsetMinutes(ms, timeZone) * MINUTE_MS === wall - ms);
  if (valid.length > 0) return Math.min(...valid);
  // In a gap: read the wall time with the offset from before the change.
  return wall - before * MINUTE_MS;
}

/** The instant the local day containing `ms` starts in `timeZone`. */
export function startOfZonedDay(ms: number, timeZone: string): number {
  return fromZoned({ ...toZoned(ms, timeZone), hour: 0, minute: 0 }, timeZone);
}
