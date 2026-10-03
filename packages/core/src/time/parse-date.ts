import {
  dayNumber,
  isValidDate,
  type LocalDate,
  type LocalDateTime,
  type LocalTime,
} from './local-date';

/**
 * Parsing of typed dates and times, shared by Grade Calc's bulk add and the quick-add bar.
 * Dates: 10/7, 10/7/2026, 10/7/26, 2026-10-07, Oct 7, October 7th 2026. Times: 2pm, 9:30 am,
 * 14:30. A date without a year gets the year that puts it closest to `today`.
 */

export const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

/** Due dates without a time mean 11:59 pm. */
export const END_OF_DAY: LocalTime = { hour: 23, minute: 59 };

const TIME = /^(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?$/i;
const SLASH_DATE = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const NAMED_DATE = /^([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?$/i;

/** The year (last, this or next) that puts month/day closest to today. */
function closestYear(month: number, day: number, today: LocalDate): number | null {
  let best: { year: number; distance: number } | null = null;
  for (const year of [today.year - 1, today.year, today.year + 1]) {
    if (!isValidDate(year, month, day)) continue;
    const distance = Math.abs(dayNumber({ year, month, day }) - dayNumber(today));
    if (!best || distance < best.distance) best = { year, distance };
  }
  return best?.year ?? null;
}

/** "Oct", "Sept" and "October" are months; "Octopus" is not. 1–12, or 0. */
export function monthNumber(name: string): number {
  const lower = name.toLowerCase();
  if (lower.length < 3) return 0;
  return (
    MONTHS.findIndex((m) => m.startsWith(lower) || (lower === 'sept' && m === 'september')) + 1
  );
}

/**
 * "2pm", "9:30 am", "14:30", "at 5pm". A bare number like "20" is not a time (it could be
 * points or a count), so it needs am/pm or minutes.
 */
export function parseTime(text: string): LocalTime | null {
  const match = TIME.exec(text.trim());
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  const meridiem = match[3]?.toLowerCase().replaceAll('.', '');
  if (!meridiem && match[2] === undefined) return null;
  if (minute > 59) return null;
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    if (meridiem === 'pm' && hour !== 12) hour += 12;
    if (meridiem === 'am' && hour === 12) hour = 0;
  } else if (hour > 23) {
    return null;
  }
  return { hour, minute };
}

/** A calendar date in one of the supported styles, or null. */
export function parseDateOnly(text: string, today: LocalDate): LocalDate | null {
  let match = ISO_DATE.exec(text);
  if (match) {
    const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
    return isValidDate(year, month, day) ? { year, month, day } : null;
  }
  match = SLASH_DATE.exec(text);
  if (match) {
    const month = Number(match[1]);
    const day = Number(match[2]);
    if (match[3]) {
      const year = match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3]);
      return isValidDate(year, month, day) ? { year, month, day } : null;
    }
    const year = closestYear(month, day, today);
    return year === null ? null : { year, month, day };
  }
  match = NAMED_DATE.exec(text);
  if (match?.[1]) {
    const month = monthNumber(match[1]);
    if (month === 0) return null;
    const day = Number(match[2]);
    if (match[3]) {
      const year = Number(match[3]);
      return isValidDate(year, month, day) ? { year, month, day } : null;
    }
    const year = closestYear(month, day, today);
    return year === null ? null : { year, month, day };
  }
  return null;
}

/** A date with an optional time after it ("10/7", "Oct 7 2pm", "due 2026-10-07 at 14:30"). */
export function parseDateTime(text: string, today: LocalDate): LocalDateTime | null {
  const field = text.replace(/^due\s+/i, '').trim();
  const split = /^(.*?)(?:\s+(?:at\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)?))?$/i.exec(
    field,
  );
  const candidates: [string, string | undefined][] = [[field, undefined]];
  if (split?.[1] && split[2]) candidates.push([split[1], split[2]]);
  for (const [datePart, timePart] of candidates) {
    const time = timePart === undefined ? END_OF_DAY : parseTime(timePart);
    if (!time) continue;
    const date = parseDateOnly(datePart.trim(), today);
    if (date) return { ...date, ...time };
  }
  return null;
}
