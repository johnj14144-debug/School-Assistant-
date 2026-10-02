import type { LocalDate, LocalDateTime } from '@sa/core';

/**
 * Due dates are UTC instants (ADR 0007). The user types and reads them in the laptop's
 * current time zone; these helpers convert at that edge. A date without a time means
 * 11:59 pm local.
 */

const pad = (n: number) => String(n).padStart(2, '0');

export function todayLocal(now = new Date()): LocalDate {
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
}

/** Local wall-clock parts → UTC ISO instant. */
export function isoFromLocal(parts: LocalDateTime): string {
  return new Date(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute).toISOString();
}

/** UTC instant → `YYYY-MM-DD` for an `<input type="date">` (local date), or ''. */
export function toDateInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * `YYYY-MM-DD` from a date input → UTC instant, keeping the local time of `previous` if there
 * was one (else 11:59 pm). '' → null.
 */
export function fromDateInput(value: string, previous: string | null = null): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const before = previous ? new Date(previous) : null;
  return isoFromLocal({
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: before ? before.getHours() : 23,
    minute: before ? before.getMinutes() : 59,
  });
}

/** "Tue, Oct 7", plus the time unless it's 11:59 pm, plus the year if it isn't this year. */
export function formatDue(iso: string | null, now = new Date()): string {
  if (!iso) return '';
  const d = new Date(iso);
  const date = d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  });
  if (d.getHours() === 23 && d.getMinutes() === 59) return date;
  return `${date}, ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
}

/** UH terms: Spring (Jan–May), Summer (Jun–Jul), Fall (Aug–Dec). */
export function guessTerm(now = new Date()): string {
  const month = now.getMonth() + 1;
  const season = month <= 5 ? 'Spring' : month <= 7 ? 'Summer' : 'Fall';
  return `${season} ${now.getFullYear()}`;
}
