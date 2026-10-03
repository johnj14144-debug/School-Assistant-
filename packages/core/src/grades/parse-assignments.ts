import type { LocalDate, LocalDateTime, LocalTime } from '../time/local-date';
import { parseDateTime, parseTime } from '../time/parse-date';

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

const POINTS = /^(\d+(?:\.\d+)?)(?:\s*\/\s*(\d+(?:\.\d+)?))?\s*(pts?|points?)?\.?$/i;
const EXTRA_CREDIT = /^(ec|extra[\s-]?credit|bonus)$/i;

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
  let looseTime: LocalTime | null = null;

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
      const due = parseDateTime(field, options.today);
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
      const due = parseDateTime(field, options.today);
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
