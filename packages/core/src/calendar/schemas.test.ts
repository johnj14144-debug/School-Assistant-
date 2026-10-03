import { describe, expect, it } from 'vitest';
import { blockCreateSchema, fixedEventCreateSchema, fixedEventUpdateSchema } from './schemas';

describe('fixedEventCreateSchema', () => {
  const sleep = { title: 'Sleep', kind: 'sleep', startDate: '2026-10-05' };

  it('fills defaults: Houston time, no course, once', () => {
    expect(
      fixedEventCreateSchema.parse({ ...sleep, startLocal: '23:00', endLocal: '06:30' }),
    ).toEqual({
      ...sleep,
      startLocal: '23:00',
      endLocal: '06:30',
      courseId: null,
      location: '',
      rrule: null,
      timeZone: 'America/Chicago',
    });
  });

  it('checks times, dates, zones and repeat rules', () => {
    const bad = (fields: object) =>
      fixedEventCreateSchema.safeParse({
        ...sleep,
        startLocal: '23:00',
        endLocal: '06:30',
        ...fields,
      }).error?.issues[0]?.message;
    expect(bad({ startLocal: '7:00' })).toMatch(/24-hour time/);
    expect(bad({ endLocal: '24:00' })).toMatch(/24-hour time/);
    expect(bad({ startDate: '2026-02-30' })).toMatch(/date like/);
    expect(bad({ timeZone: 'Houston' })).toMatch(/Unknown time zone/);
    expect(bad({ rrule: 'FREQ=HOURLY' })).toMatch(/daily and weekly/);
    expect(bad({ title: '  ' })).toBeDefined();
    expect(bad({ rrule: ' FREQ=DAILY ' })).toBeUndefined();
  });

  it('lets an update change a single field', () => {
    expect(
      fixedEventUpdateSchema.parse({
        id: '6f1d2c1e-8b1a-4c1e-9a3e-2f0b1c2d3e4f',
        endLocal: '07:00',
      }),
    ).toEqual({ id: '6f1d2c1e-8b1a-4c1e-9a3e-2f0b1c2d3e4f', endLocal: '07:00' });
  });
});

describe('blockCreateSchema', () => {
  it('defaults to an unlocked block with no task', () => {
    expect(
      blockCreateSchema.parse({
        title: 'Review notes',
        startAt: '2026-10-07T15:00:00.000Z',
        endAt: '2026-10-07T16:00:00.000Z',
      }),
    ).toMatchObject({ taskId: null, locked: false, title: 'Review notes' });
  });
});
