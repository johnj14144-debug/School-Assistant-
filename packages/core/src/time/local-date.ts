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
