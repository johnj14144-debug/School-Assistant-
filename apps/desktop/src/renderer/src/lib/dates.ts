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

/** UTC instant → `YYYY-MM-DDTHH:mm` for an `<input type="datetime-local">`, or ''. */
export function toDateTimeInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${toDateInput(iso)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** `YYYY-MM-DDTHH:mm` (local) → UTC instant, or null when incomplete. */
export function fromDateTimeInput(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
  ];
  return isoFromLocal({ year, month, day, hour, minute });
}

/** UTC instant → `HH:mm` (local) for an `<input type="time">`, or ''. */
export function toTimeInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** A date input and an optional time input → UTC instant (no time: 11:59 pm), or null. */
export function fromDateAndTime(date: string, time: string): string | null {
  if (!date) return null;
  const t = /^(\d{2}):(\d{2})/.exec(time);
  return fromDateTimeInput(`${date}T${t ? `${t[1]}:${t[2]}` : '23:59'}`);
}

/** "2:05 PM" in the laptop's zone. */
export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** Whether a due date has passed, is today, falls in the next 7 days, or later. */
export function dueStatus(
  iso: string | null,
  now = new Date(),
): 'none' | 'overdue' | 'today' | 'week' | 'later' {
  if (!iso) return 'none';
  const due = new Date(iso);
  if (due.getTime() < now.getTime()) return 'overdue';
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // Rounded: a day across a DST change is 23 or 25 hours long.
  const days = Math.round(
    (new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime() -
      startOfToday.getTime()) /
      86_400_000,
  );
  if (days === 0) return 'today';
  return days < 7 ? 'week' : 'later';
}

/** "Today", "Tomorrow", "Fri", "Oct 12" (+ time unless 11:59 pm), for task due dates. */
export function formatTaskDue(iso: string | null, now = new Date()): string {
  if (!iso) return '';
  const d = new Date(iso);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round(
    (new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - startOfToday.getTime()) /
      86_400_000,
  );
  let day: string;
  if (days === 0) day = 'Today';
  else if (days === 1) day = 'Tomorrow';
  else if (days === -1) day = 'Yesterday';
  else if (days > 1 && days < 7) day = d.toLocaleDateString(undefined, { weekday: 'short' });
  else {
    day = d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric',
    });
  }
  return d.getHours() === 23 && d.getMinutes() === 59 ? day : `${day} ${formatTime(iso)}`;
}

/**
 * "I started at 2:15" → the last moment with that local time: today's, or yesterday's if that
 * hasn't happened yet (typing 11:30 pm just after midnight). null for an incomplete time.
 */
export function pastTimeToIso(time: string, now = new Date()): string | null {
  const match = /^(\d{2}):(\d{2})/.exec(time);
  if (!match) return null;
  const at = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    Number(match[1]),
    Number(match[2]),
  );
  if (at.getTime() > now.getTime()) at.setDate(at.getDate() - 1);
  return at.toISOString();
}
