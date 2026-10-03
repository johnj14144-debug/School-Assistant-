import type { BlockView, CalendarRange, FixedEvent, OccurrenceView } from '@sa/core';
import { beforeAll, describe, expect, it } from 'vitest';

beforeAll(() => {
  // Houston. Node re-reads TZ when it changes.
  process.env.TZ = 'America/Chicago';
});

const { agendaItems, blockMinutesFor, plannedTaskId, toEventInputs, todayAndTomorrow, weekAround } =
  await import('./events');
const {
  describeRepeat,
  formFromEvent,
  formatWallTime,
  inputFromForm,
  newForm,
  rruleFromForm,
  starterRoutine,
} = await import('./routine');

const ID = '6f1d2c1e-8b1a-4c1e-9a3e-2f0b1c2d3e4f';
const event = (fields: Partial<FixedEvent>): FixedEvent => ({
  id: ID,
  title: 'MATH 2413',
  kind: 'class',
  courseId: null,
  location: '',
  startDate: '2026-08-24',
  startLocal: '10:00',
  endLocal: '10:50',
  rrule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR;UNTIL=20261209',
  timeZone: 'America/Chicago',
  exceptions: [],
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  ...fields,
});

describe('routine form', () => {
  it('reads a class into day toggles and writes the same rule back', () => {
    const form = formFromEvent(event({}));
    expect(form).toMatchObject({ repeat: 'weekly', days: [1, 3, 5], lastDay: '2026-12-09' });
    expect(rruleFromForm(form)).toBe('FREQ=WEEKLY;BYDAY=MO,WE,FR;UNTIL=20261209');
    expect(formFromEvent(event({ rrule: 'FREQ=DAILY;BYDAY=MO,TU' }))).toMatchObject({
      repeat: 'weekly',
      days: [1, 2],
    });
    expect(formFromEvent(event({ rrule: null })).repeat).toBe('once');
  });

  it('starts new events from sensible presets', () => {
    expect(newForm('sleep', '2026-10-07')).toMatchObject({
      title: 'Sleep',
      startLocal: '23:00',
      endLocal: '06:30',
      repeat: 'daily',
      timeZone: 'America/Chicago',
    });
    expect(newForm('class', '2026-10-07')).toMatchObject({ repeat: 'weekly', days: [] });
  });

  it('builds IPC input and says what is missing', () => {
    const form = { ...newForm('class', '2026-08-24'), title: ' MATH 2413 ' };
    expect(() => inputFromForm(form)).toThrow(/at least one day/);
    expect(() => inputFromForm({ ...form, title: '' })).toThrow(/title/);
    expect(inputFromForm({ ...form, days: [4, 2], interval: 2 })).toMatchObject({
      title: 'MATH 2413',
      courseId: null,
      rrule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH',
    });
    expect(inputFromForm({ ...form, repeat: 'once' }).rrule).toBeNull();
    expect(inputFromForm({ ...form, repeat: 'daily', lastDay: '2026-12-01' }).rrule).toBe(
      'FREQ=DAILY;UNTIL=20261201',
    );
  });

  it('describes repeats for the routine list', () => {
    const today = '2026-10-07';
    expect(describeRepeat(event({}), today)).toBe('Mon, Wed, Fri · until Dec 9');
    expect(describeRepeat(event({ rrule: 'FREQ=DAILY' }), today)).toBe('Every day');
    expect(describeRepeat(event({ rrule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=TU' }), today)).toBe(
      'Every 2 weeks on Tue',
    );
    expect(describeRepeat(event({ rrule: null, startDate: '2026-10-09' }), today)).toBe(
      'Once, Fri Oct 9',
    );
    expect(
      describeRepeat(event({ rrule: 'FREQ=WEEKLY;BYDAY=MO', startDate: '2027-01-11' }), today),
    ).toBe('Mon · from Jan 11, 2027');
  });

  it('formats wall-clock times and offers a starter routine with the full sleep floor', () => {
    expect(formatWallTime('23:00')).toBe('11:00 PM');
    expect(formatWallTime('06:30')).toBe('6:30 AM');
    const starter = starterRoutine('2026-10-07');
    expect(starter.map((e) => e.title)).toContain('Sleep');
    expect(starter.find((e) => e.kind === 'sleep')).toMatchObject({
      startLocal: '23:00',
      endLocal: '06:30',
    });
  });
});

const occurrence = (fields: Partial<OccurrenceView>): OccurrenceView => ({
  eventId: ID,
  title: 'MATH 2413',
  kind: 'class',
  location: 'PGH 232',
  courseId: null,
  color: '#0ea5e9',
  date: '2026-10-07',
  startAt: '2026-10-07T15:00:00.000Z',
  endAt: '2026-10-07T15:50:00.000Z',
  extendedMin: 0,
  ...fields,
});
const block = (fields: Partial<BlockView>): BlockView => ({
  id: ID,
  taskId: null,
  title: 'Study',
  startAt: '2026-10-07T16:00:00.000Z',
  endAt: '2026-10-07T17:00:00.000Z',
  locked: false,
  source: 'manual',
  kind: 'work',
  reason: '',
  createdAt: '2026-10-07T00:00:00.000Z',
  updatedAt: '2026-10-07T00:00:00.000Z',
  task: null,
  label: 'Study',
  color: '#6366f1',
  conflict: null,
  ...fields,
});

describe('calendar events', () => {
  const range: CalendarRange = {
    occurrences: [occurrence({})],
    blocks: [
      block({ locked: true, conflict: 'MATH 2413 (10:00 AM – 10:50 AM)' }),
      block({
        id: '7f1d2c1e-8b1a-4c1e-9a3e-2f0b1c2d3e4f',
        startAt: '2026-10-07T14:00:00.000Z',
        endAt: '2026-10-07T15:30:00.000Z',
        label: 'Laundry',
        task: {
          id: ID,
          title: 'Laundry',
          status: 'open',
          attention: 'background',
          course: null,
          running: true,
        },
      }),
    ],
    nightsWithoutSleep: [],
  };

  it('keeps fixed events in place; blocks drag unless locked', () => {
    const [fixed, locked, laundry] = toEventInputs(range);
    expect(fixed).toMatchObject({
      id: `fixed:${ID}:2026-10-07`,
      color: '#0ea5e9',
      editable: false,
      className: 'sa-fixed sa-fixed-class',
    });
    expect(locked).toMatchObject({
      editable: false,
      className: 'sa-block sa-locked sa-conflict',
    });
    expect(laundry).toMatchObject({ editable: true, className: 'sa-block sa-running' });
  });

  it('lists the day in time order for the Today page', () => {
    const items = agendaItems(range);
    expect(items.map((i) => [i.title, i.background])).toEqual([
      ['Laundry', true],
      ['MATH 2413 · PGH 232', false],
      ['Study', false],
    ]);
    // Only an open focus task planned now is offered first; laundry and title-only blocks aren't.
    expect(items.map((i) => plannedTaskId(i))).toEqual([null, null, null]);
    const hw = block({
      task: {
        id: ID,
        title: 'Calc HW',
        status: 'open',
        attention: 'focus',
        course: null,
        running: false,
      },
    });
    const [hwItem] = agendaItems({ ...range, occurrences: [], blocks: [hw] });
    expect(plannedTaskId(hwItem ?? null)).toBe(ID);
    expect(plannedTaskId(null)).toBeNull();
  });

  it('sizes a dropped task by what is left of its estimate', () => {
    expect(blockMinutesFor({ estimateMin: null, actualMin: 0 })).toBe(60);
    expect(blockMinutesFor({ estimateMin: 90, actualMin: 22 })).toBe(70);
    expect(blockMinutesFor({ estimateMin: 10, actualMin: 0 })).toBe(15);
    expect(blockMinutesFor({ estimateMin: 600, actualMin: 0 })).toBe(240);
    expect(blockMinutesFor({ estimateMin: 30, actualMin: 45 })).toBe(30);
  });

  it('finds the local week and today’s range, across the November change', () => {
    expect(weekAround(new Date('2026-10-07T15:00:00Z'))).toEqual({
      from: '2026-10-04T05:00:00.000Z',
      to: '2026-10-11T05:00:00.000Z',
    });
    // The week of Nov 1 is 169 hours long.
    expect(weekAround(new Date('2026-11-03T15:00:00Z'))).toEqual({
      from: '2026-11-01T05:00:00.000Z',
      to: '2026-11-08T06:00:00.000Z',
    });
    expect(todayAndTomorrow(new Date('2026-10-07T15:00:00Z'))).toEqual({
      from: '2026-10-07T05:00:00.000Z',
      dayEnd: '2026-10-08T05:00:00.000Z',
      to: '2026-10-09T05:00:00.000Z',
    });
  });
});
