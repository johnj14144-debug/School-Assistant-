/**
 * Local wall-clock dates and times (no zone attached). Parsers in core return these; the caller
 * turns them into UTC instants in the right zone (ADR 0007).
 */

export interface LocalDate {
  year: number;
  month: number;
  day: number;
}

export interface LocalTime {
  hour: number;
  minute: number;
}

export interface LocalDateTime extends LocalDate, LocalTime {}

export function isValidDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Days since 1970-01-01, for differences between local dates. */
export function dayNumber(d: LocalDate): number {
  return Date.UTC(d.year, d.month - 1, d.day) / 86_400_000;
}

export function addDays(date: LocalDate, days: number): LocalDate {
  const d = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(date: LocalDate): number {
  return new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
}

const pad = (n: number) => String(n).padStart(2, '0');

/** `YYYY-MM-DD`, the text form used in the database and in date inputs. */
export function formatLocalDate(d: LocalDate): string {
  return `${String(d.year).padStart(4, '0')}-${pad(d.month)}-${pad(d.day)}`;
}

/** `YYYY-MM-DD` → a valid local date, or null. */
export function parseLocalDate(text: string): LocalDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  return isValidDate(year, month, day) ? { year, month, day } : null;
}

/** `HH:mm` (24-hour). */
export function formatLocalTime(t: LocalTime): string {
  return `${pad(t.hour)}:${pad(t.minute)}`;
}

/** `HH:mm` (24-hour) → a local time, or null. */
export function parseLocalTime(text: string): LocalTime | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(text);
  return match ? { hour: Number(match[1]), minute: Number(match[2]) } : null;
}

/** Minutes since midnight. */
export function minuteOfDay(t: LocalTime): number {
  return t.hour * 60 + t.minute;
}

export function compareDates(a: LocalDate, b: LocalDate): number {
  return dayNumber(a) - dayNumber(b);
}
