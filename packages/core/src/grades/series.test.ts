import { describe, expect, it } from 'vitest';
import { MAX_SERIES_COUNT, numberedSeries } from './series';

describe('numberedSeries', () => {
  it('numbers the titles and spaces the due dates', () => {
    const items = numberedSeries({
      name: ' Video Quiz ',
      count: 3,
      firstDue: { year: 2026, month: 8, day: 30 },
      everyDays: 7,
    });
    expect(items).toEqual([
      { title: 'Video Quiz 1', due: { year: 2026, month: 8, day: 30, hour: 23, minute: 59 } },
      { title: 'Video Quiz 2', due: { year: 2026, month: 9, day: 6, hour: 23, minute: 59 } },
      { title: 'Video Quiz 3', due: { year: 2026, month: 9, day: 13, hour: 23, minute: 59 } },
    ]);
  });

  it('crosses month and year ends and keeps the local time', () => {
    const items = numberedSeries({
      name: 'RR',
      count: 3,
      start: 12,
      firstDue: { year: 2026, month: 12, day: 24 },
      everyDays: 4,
      time: { hour: 9, minute: 30 },
    });
    expect(items.map((i) => i.title)).toEqual(['RR 12', 'RR 13', 'RR 14']);
    expect(items.map((i) => i.due)).toEqual([
      { year: 2026, month: 12, day: 24, hour: 9, minute: 30 },
      { year: 2026, month: 12, day: 28, hour: 9, minute: 30 },
      { year: 2027, month: 1, day: 1, hour: 9, minute: 30 },
    ]);
  });

  it('leaves due dates empty without a first date, and handles leap days', () => {
    expect(numberedSeries({ name: 'HW', count: 2, firstDue: null, everyDays: 7 })).toEqual([
      { title: 'HW 1', due: null },
      { title: 'HW 2', due: null },
    ]);
    const leap = numberedSeries({
      name: 'Lab',
      count: 2,
      firstDue: { year: 2028, month: 2, day: 28 },
      everyDays: 1,
    });
    expect(leap[1]?.due).toMatchObject({ year: 2028, month: 2, day: 29 });
  });

  it('caps and floors the count', () => {
    expect(numberedSeries({ name: 'A', count: 0, firstDue: null, everyDays: 1 })).toEqual([]);
    expect(numberedSeries({ name: 'A', count: -3, firstDue: null, everyDays: 1 })).toEqual([]);
    expect(numberedSeries({ name: 'A', count: 2.7, firstDue: null, everyDays: 1 })).toHaveLength(2);
    expect(numberedSeries({ name: 'A', count: 10_000, firstDue: null, everyDays: 1 })).toHaveLength(
      MAX_SERIES_COUNT,
    );
  });
});
