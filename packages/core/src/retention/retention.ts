/** Matches a local calendar date key such as 2026-10-02. */
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export interface RetentionPolicy {
  /** How many of the newest dates to keep. */
  keepLatest: number;
  /** Also keep the earliest date of every month, forever. */
  keepFirstOfMonth: boolean;
}

/**
 * Which dated copies (backups, daily logs) to delete under a retention policy. Dates are
 * `YYYY-MM-DD` keys; anything else is never returned, so unrelated files are never touched.
 */
export function datesToPrune(dates: readonly string[], policy: RetentionPolicy): string[] {
  const unique = [...new Set(dates.filter((d) => DATE_KEY.test(d)))].sort();
  const keep = new Set(unique.slice(Math.max(0, unique.length - policy.keepLatest)));
  if (policy.keepFirstOfMonth) {
    const seenMonths = new Set<string>();
    for (const date of unique) {
      const month = date.slice(0, 7);
      if (!seenMonths.has(month)) {
        seenMonths.add(month);
        keep.add(date);
      }
    }
  }
  return unique.filter((d) => !keep.has(d));
}
