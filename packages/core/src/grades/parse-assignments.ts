/**
 * Turns pasted lines into assignments for Grade Calc's bulk add, e.g.
 *
 *   HW 1, 10/7, 20 pts
 *   Quiz 2; Oct 14 2pm; 8/10 pts; Quizzes
 *   Presentation, 5 pts, extra credit
 *
 * Fields are separated by commas, semicolons, tabs or `|`. The first field is the title. The
 * others can come in any order: a due date (10/7, 10/7/2026, 2026-10-07, Oct 7, with an
 * optional time like 2pm or 14:30; default 11:59 pm), points (20, 20 pts, or 18/20 for a graded
 * score), a category name, or "EC"/"extra credit". A bare `a/b` is read as a date when the line
 * has no date yet, so write scores as `8/10 pts`.
 *
 * Due dates come back as local wall-clock parts; the caller turns them into a UTC instant in
 * the laptop's zone (ADR 0007). The year is the one that puts the date closest to `today`.
 */

export interface LocalDate {
  year: number;
  month: number;
  day: number;
}

export interface LocalDateTime extends LocalDate {
  hour: number;
  minute: number;
}

export interface ParsedAssignmentLine {
  /** 1-based line number in the pasted text. */
  line: number;
  title: string;
  due: LocalDateTime | null;
  pointsPossible: number | null;
  pointsEarned: number | null;
  extraCredit: boolean;
  /** The matching category name as given in `categoryNames`, or null. */
  categoryName: string | null;
  /** Empty when the line can be added. */
  errors: string[];
}

export interface ParseAssignmentOptions {
  today: LocalDate;
  categoryNames: readonly string[];
}

const MONTHS = [
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
const DEFAULT_TIME = { hour: 23, minute: 59 };

const TIME = /^(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?$/i;
const SLASH_DATE = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const NAMED_DATE = /^([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?$/i;
const POINTS = /^(\d+(?:\.\d+)?)(?:\s*\/\s*(\d+(?:\.\d+)?))?\s*(pts?|points?)?\.?$/i;
const EXTRA_CREDIT = /^(ec|extra[\s-]?credit|bonus)$/i;

function isValidDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function dayNumber(d: LocalDate): number {
  return Date.UTC(d.year, d.month - 1, d.day) / 86_400_000;
}

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

function parseTime(text: string): { hour: number; minute: number } | null {
  const match = TIME.exec(text.trim());
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  const meridiem = match[3]?.toLowerCase().replaceAll('.', '');
  // A bare number like "20" is points, not a time.
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

/** A date with an optional time after it ("10/7", "Oct 7 2pm", "2026-10-07 at 14:30"). */
function parseDate(text: string, today: LocalDate): LocalDateTime | null {
  const field = text.replace(/^due\s+/i, '').trim();
  const split = /^(.*?)(?:\s+(?:at\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)?))?$/i.exec(
    field,
  );
  const candidates: [string, string | undefined][] = [[field, undefined]];
  if (split?.[1] && split[2]) candidates.push([split[1], split[2]]);
  for (const [datePart, timePart] of candidates) {
    const time = timePart === undefined ? DEFAULT_TIME : parseTime(timePart);
    if (!time) continue;
    const date = parseDateOnly(datePart.trim(), today);
    if (date) return { ...date, ...time };
  }
  return null;
}

function parseDateOnly(text: string, today: LocalDate): LocalDate | null {
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
    // "Oct", "Sept" and "October" are months; "Octopus" is not.
    const name = match[1].toLowerCase();
    const month =
      MONTHS.findIndex((m) => m.startsWith(name) || (name === 'sept' && m === 'september')) + 1;
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

function parseLine(text: string, line: number, options: ParseAssignmentOptions) {
  const [first = '', ...rest] = text.split(/[,;\t|]/).map((f) => f.trim());
  const fields = rest.filter((f) => f.length > 0);
  const result: ParsedAssignmentLine = {
    line,
    title: first,
    due: null,
    pointsPossible: null,
    pointsEarned: null,
    extraCredit: false,
    categoryName: null,
    errors: [],
  };
  const categories = new Map(options.categoryNames.map((name) => [name.toLowerCase(), name]));
  let looseTime: { hour: number; minute: number } | null = null;

  for (const field of fields) {
    const category = categories.get(field.toLowerCase());
    if (category && !result.categoryName) {
      result.categoryName = category;
      continue;
    }
    if (EXTRA_CREDIT.test(field)) {
      result.extraCredit = true;
      continue;
    }
    const time = parseTime(field);
    if (time) {
      looseTime = time;
      continue;
    }
    const points = POINTS.exec(field);
    const hasUnit = Boolean(points?.[3]);
    // "10/7" is a date unless the line already has one or it says pts.
    if (!result.due && !hasUnit) {
      const due = parseDate(field, options.today);
      if (due) {
        result.due = due;
        continue;
      }
    }
    if (points && result.pointsPossible === null) {
      if (points[2] !== undefined) {
        result.pointsEarned = Number(points[1]);
        result.pointsPossible = Number(points[2]);
      } else {
        result.pointsPossible = Number(points[1]);
      }
      continue;
    }
    if (!result.due) {
      const due = parseDate(field, options.today);
      if (due) {
        result.due = due;
        continue;
      }
    }
    result.errors.push(`Didn't understand "${field}"`);
  }
  // A time in its own field ("10/7, 2pm") sets the due time.
  if (looseTime) {
    if (result.due) result.due = { ...result.due, ...looseTime };
    else result.errors.push('A time was given without a date');
  }

  if (!result.title) result.errors.push('Missing a title');
  if (result.pointsPossible === null) result.errors.push('Missing the points (e.g. "20 pts")');
  return result;
}

/** Parses every non-empty line. Lines with errors are returned too, so the UI can show them. */
export function parseAssignmentLines(
  text: string,
  options: ParseAssignmentOptions,
): ParsedAssignmentLine[] {
  return text
    .split(/\r?\n/)
    .map((raw, index) => ({ raw: raw.trim(), line: index + 1 }))
    .filter(({ raw }) => raw.length > 0)
    .map(({ raw, line }) => parseLine(raw, line, options));
}
