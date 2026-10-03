import { addDays, type LocalDate, type LocalDateTime } from '../time/local-date';

/**
 * A numbered series for Grade Calc's bulk add, e.g. "Video Quiz 1" … "Video Quiz 8", due every
 * 7 days from the first due date. Due dates are local wall-clock parts (11:59 pm unless a time
 * is given); the caller turns them into UTC instants in the laptop's zone (ADR 0007), so a
 * weekly series stays at the same local time across a DST change.
 */

export interface SeriesOptions {
  /** "Video Quiz" → "Video Quiz 1", "Video Quiz 2", … */
  name: string;
  count: number;
  /** The first number; defaults to 1. */
  start?: number;
  /** null → no due dates. */
  firstDue: LocalDate | null;
  everyDays: number;
  time?: { hour: number; minute: number };
}

export interface SeriesItem {
  title: string;
  due: LocalDateTime | null;
}

export const MAX_SERIES_COUNT = 200;

export function numberedSeries(options: SeriesOptions): SeriesItem[] {
  const name = options.name.trim();
  const count = Math.min(Math.max(0, Math.floor(options.count)), MAX_SERIES_COUNT);
  const start = options.start ?? 1;
  const time = options.time ?? { hour: 23, minute: 59 };
  const first = options.firstDue;
  return Array.from({ length: count }, (_, i) => ({
    title: `${name} ${start + i}`,
    due: first ? { ...addDays(first, i * options.everyDays), ...time } : null,
  }));
}
