import { describe, expect, it } from 'vitest';
import {
  availability,
  expandFixedEvents,
  freeIntervals,
  nightsWithoutSleep,
  type RecurringEvent,
  wallMinutes,
} from './expand';
import { toZoned } from './zone';

const HOUSTON = 'America/Chicago';

interface TestEvent extends RecurringEvent {
  id: string;
}

const event = (id: string, fields: Partial<TestEvent>): TestEvent => ({
  id,
  kind: 'other',
  startDate: '2026-01-05',
  startLocal: '10:00',
  endLocal: '11:00',
  rrule: 'FREQ=DAILY',
  timeZone: HOUSTON,
  exceptions: [],
  ...fields,
});

/** Spring 2026 MATH 2413, MWF 10:00–10:50, plus a daily routine. */
const routine = [
  event('calc', {
    kind: 'class',
    startDate: '2026-01-12',
    startLocal: '10:00',
    endLocal: '10:50',
    rrule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR;UNTIL=20261209',
  }),
  event('sleep', { kind: 'sleep', startLocal: '23:00', endLocal: '06:30' }),
  event('lunch', { kind: 'meal', startLocal: '12:00', endLocal: '12:30' }),
];

/** Local "Mon 10:00–10:50" labels in Houston for each occurrence. */
function labels(occurrences: { event: TestEvent; startAt: string; endAt: string }[]) {
  const fmt = (iso: string) => {
    const t = toZoned(Date.parse(iso), HOUSTON);
    return `${t.month}/${t.day} ${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}`;
  };
  return occurrences.map((o) => `${o.event.id} ${fmt(o.startAt)}–${fmt(o.endAt)}`);
}

const hours = (o: { startAt: string; endAt: string }) =>
  (Date.parse(o.endAt) - Date.parse(o.startAt)) / 3_600_000;

describe('expandFixedEvents across daylight-saving changes', () => {
  it('keeps class, sleep and lunch at the same local times through the March change', () => {
    // Fri Mar 6 – Mon Mar 9, 2026 (clocks spring forward Sunday Mar 8 at 2 am).
    const occ = expandFixedEvents(routine, '2026-03-06T06:00:00Z', '2026-03-10T05:00:00Z');
    expect(labels(occ)).toEqual([
      'sleep 3/5 23:00–3/6 06:30',
      'calc 3/6 10:00–3/6 10:50',
      'lunch 3/6 12:00–3/6 12:30',
      'sleep 3/6 23:00–3/7 06:30',
      'lunch 3/7 12:00–3/7 12:30',
      // The short night (6.5 h real) is extended to the 7.5 h floor: wake at 7:30.
      'sleep 3/7 23:00–3/8 07:30',
      'lunch 3/8 12:00–3/8 12:30',
      'sleep 3/8 23:00–3/9 06:30',
      'calc 3/9 10:00–3/9 10:50',
      'lunch 3/9 12:00–3/9 12:30',
      'sleep 3/9 23:00–3/10 06:30',
    ]);
    // Same local time, different UTC instant before and after the change.
    const calc = occ.filter((o) => o.event.id === 'calc');
    expect(calc.map((o) => o.startAt)).toEqual([
      '2026-03-06T16:00:00.000Z',
      '2026-03-09T15:00:00.000Z',
    ]);
    const shortNight = occ.find((o) => o.date === '2026-03-07' && o.event.id === 'sleep');
    expect(shortNight).toMatchObject({ extendedMin: 60 });
    expect(hours(shortNight ?? { startAt: '', endAt: '' })).toBe(7.5);
  });

  it('keeps them put through the November change; the long night is 8.5 h', () => {
    // Fri Oct 30 – Mon Nov 2, 2026 (clocks fall back Sunday Nov 1 at 2 am).
    const occ = expandFixedEvents(routine, '2026-10-30T05:00:00Z', '2026-11-03T06:00:00Z');
    const sleep = occ.filter((o) => o.event.id === 'sleep');
    expect(labels(sleep)).toEqual([
      'sleep 10/29 23:00–10/30 06:30',
      'sleep 10/30 23:00–10/31 06:30',
      'sleep 10/31 23:00–11/1 06:30',
      'sleep 11/1 23:00–11/2 06:30',
      'sleep 11/2 23:00–11/3 06:30',
    ]);
    expect(sleep.map(hours)).toEqual([7.5, 7.5, 8.5, 7.5, 7.5]);
    expect(sleep.every((o) => o.extendedMin === 0)).toBe(true);
    expect(labels(occ.filter((o) => o.event.id === 'calc'))).toEqual([
      'calc 10/30 10:00–10/30 10:50',
      'calc 11/2 10:00–11/2 10:50',
    ]);
    expect(occ.find((o) => o.event.id === 'calc' && o.date === '2026-11-02')?.startAt).toBe(
      '2026-11-02T16:00:00.000Z',
    );
  });

  it('leaves out skipped dates and anything outside the term', () => {
    const cancelled = [
      { ...routine[0], exceptions: ['2026-03-09'] } as TestEvent,
      routine[1] as TestEvent,
    ];
    const occ = expandFixedEvents(cancelled, '2026-03-09T05:00:00Z', '2026-03-10T05:00:00Z');
    expect(occ.map((o) => o.event.id)).toEqual(['sleep', 'sleep']);
    expect(
      expandFixedEvents(routine.slice(0, 1), '2026-12-10T06:00:00Z', '2026-12-20T06:00:00Z'),
    ).toEqual([]);
  });

  it('includes the overnight occurrence that started before the window', () => {
    const occ = expandFixedEvents(
      [routine[1] as TestEvent],
      '2026-10-07T10:00:00Z',
      '2026-10-07T12:00:00Z',
    );
    // 5:00–7:00 Houston: inside the night of Oct 6.
    expect(occ).toHaveLength(1);
    expect(occ[0]).toMatchObject({ date: '2026-10-06', endAt: '2026-10-07T11:30:00.000Z' });
  });

  it('uses each event’s own zone, not the laptop’s', () => {
    const tokyo = event('call', { startLocal: '09:00', endLocal: '09:30', timeZone: 'Asia/Tokyo' });
    const occ = expandFixedEvents([tokyo], '2026-10-07T00:00:00Z', '2026-10-08T00:00:00Z');
    expect(occ.map((o) => o.startAt)).toEqual(['2026-10-07T00:00:00.000Z']);
  });

  it('extends a sleep event shorter than the floor and honors a custom floor', () => {
    const nap = event('sleep', { kind: 'sleep', startLocal: '00:00', endLocal: '06:00' });
    const [o] = expandFixedEvents([nap], '2026-10-07T05:00:00Z', '2026-10-07T06:00:00Z');
    expect(o).toMatchObject({ extendedMin: 90, endAt: '2026-10-07T12:30:00.000Z' });
    const [o8] = expandFixedEvents([nap], '2026-10-07T05:00:00Z', '2026-10-07T06:00:00Z', {
      sleepFloorMin: 480,
    });
    expect(o8?.extendedMin).toBe(120);
  });

  it('skips events whose stored rule or zone no longer parse', () => {
    const broken = [event('a', { rrule: 'FREQ=YEARLY' }), event('b', { timeZone: 'Mars/Base' })];
    expect(expandFixedEvents(broken, '2026-10-07T00:00:00Z', '2026-10-08T00:00:00Z')).toEqual([]);
  });
});

describe('wallMinutes', () => {
  it('measures wall-clock length, wrapping past midnight', () => {
    expect(wallMinutes('10:00', '10:50')).toBe(50);
    expect(wallMinutes('23:00', '06:30')).toBe(450);
    expect(wallMinutes('09:00', '09:00')).toBe(1440);
  });
});

describe('freeIntervals / availability', () => {
  it('subtracts overlapping busy intervals from the window', () => {
    const z = (h: string) => `2026-10-07T${h}:00.000Z`;
    expect(
      freeIntervals(z('08:00'), z('18:00'), [
        { startAt: z('07:00'), endAt: z('09:00') },
        { startAt: z('12:00'), endAt: z('13:00') },
        { startAt: z('12:30'), endAt: z('14:00') },
        { startAt: z('17:00'), endAt: z('19:00') },
      ]),
    ).toEqual([
      { startAt: z('09:00'), endAt: z('12:00') },
      { startAt: z('14:00'), endAt: z('17:00') },
    ]);
    expect(freeIntervals(z('08:00'), z('09:00'), [])).toEqual([
      { startAt: z('08:00'), endAt: z('09:00') },
    ]);
  });

  it('gives the free time of a Monday around class, lunch and sleep', () => {
    // Mon Oct 5, 2026, midnight to midnight in Houston (CDT, UTC-5).
    const free = availability(routine, '2026-10-05T05:00:00Z', '2026-10-06T05:00:00Z');
    expect(
      free.map(
        (f) =>
          `${toZoned(Date.parse(f.startAt), HOUSTON).hour}:${String(toZoned(Date.parse(f.startAt), HOUSTON).minute).padStart(2, '0')}`,
      ),
    ).toEqual(['6:30', '10:50', '12:30']);
    const minutes = free.reduce(
      (sum, f) => sum + (Date.parse(f.endAt) - Date.parse(f.startAt)) / 60_000,
      0,
    );
    // 24 h − 7.5 h sleep − 50 min class − 30 min lunch.
    expect(minutes).toBe(24 * 60 - 450 - 50 - 30);
  });

  it('never leaves less than the floor for sleep across the March night', () => {
    const free = availability(routine, '2026-03-07T06:00:00Z', '2026-03-09T05:00:00Z');
    const morning = free.find((f) => f.startAt.startsWith('2026-03-08T1'));
    // Free from 7:30 CDT (12:30Z), not 6:30.
    expect(morning?.startAt).toBe('2026-03-08T12:30:00.000Z');
  });
});

describe('nightsWithoutSleep', () => {
  it('lists the dates with no sleep starting', () => {
    const weekdays = event('sleep', {
      kind: 'sleep',
      startLocal: '23:00',
      endLocal: '06:30',
      rrule: 'FREQ=DAILY;BYDAY=SU,MO,TU,WE,TH',
    });
    // Sun Oct 4 – Sat Oct 10, 2026 in Houston.
    const from = '2026-10-04T05:00:00Z';
    const to = '2026-10-11T05:00:00Z';
    const occ = expandFixedEvents([weekdays], from, to);
    expect(nightsWithoutSleep(occ, from, to, HOUSTON)).toEqual(['2026-10-09', '2026-10-10']);
    expect(nightsWithoutSleep([], from, '2026-10-05T05:00:00Z', HOUSTON)).toEqual(['2026-10-04']);
  });
});
