import { describe, expect, it } from 'vitest';
import { datesToPrune } from './retention';

function days(from: string, count: number): string[] {
  const start = Date.parse(`${from}T12:00:00Z`);
  return Array.from({ length: count }, (_, i) =>
    new Date(start + i * 86_400_000).toISOString().slice(0, 10),
  );
}

describe('datesToPrune', () => {
  it('keeps everything while there are fewer dates than the limit', () => {
    expect(
      datesToPrune(days('2026-10-01', 14), { keepLatest: 14, keepFirstOfMonth: true }),
    ).toEqual([]);
  });

  it('keeps the newest dates and the first of each month', () => {
    const all = days('2026-09-01', 60); // 2026-09-01 … 2026-10-30
    const pruned = datesToPrune(all, { keepLatest: 14, keepFirstOfMonth: true });
    const kept = all.filter((d) => !pruned.includes(d));
    expect(kept).toEqual(['2026-09-01', '2026-10-01', ...days('2026-10-17', 14)]);
  });

  it('keeps the earliest backup of a month even when the 1st is missing', () => {
    const dates = ['2026-11-03', '2026-11-04', '2026-11-05', '2026-12-02', '2026-12-03'];
    expect(datesToPrune(dates, { keepLatest: 1, keepFirstOfMonth: true })).toEqual([
      '2026-11-04',
      '2026-11-05',
    ]);
  });

  it('keeps only the newest dates without the monthly rule', () => {
    const dates = days('2026-10-01', 10);
    expect(datesToPrune(dates, { keepLatest: 7, keepFirstOfMonth: false })).toEqual(
      dates.slice(0, 3),
    );
  });

  it('ignores anything that is not a date key and duplicates', () => {
    expect(
      datesToPrune(['notes', '2026-10-01', '2026-10-01', '2026-10-02'], {
        keepLatest: 1,
        keepFirstOfMonth: false,
      }),
    ).toEqual(['2026-10-01']);
  });
});
