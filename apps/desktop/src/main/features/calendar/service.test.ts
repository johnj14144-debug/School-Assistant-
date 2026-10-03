import { describe, expect, it } from 'vitest';
import { setupCalendar } from '../../test/calendar';

const SLEEP = {
  title: 'Sleep',
  kind: 'sleep',
  startDate: '2026-08-01',
  startLocal: '23:00',
  endLocal: '06:30',
  rrule: 'FREQ=DAILY',
};
const MATH = {
  title: 'MATH 2413',
  kind: 'class',
  location: 'PGH 232',
  startDate: '2026-08-24',
  startLocal: '10:00',
  endLocal: '10:50',
  rrule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR;UNTIL=20261209',
};
const LUNCH = {
  title: 'Lunch',
  kind: 'meal',
  startDate: '2026-08-01',
  startLocal: '12:00',
  endLocal: '12:30',
  rrule: 'FREQ=DAILY',
};
// Wed Oct 7, 2026 in Houston (CDT, UTC−5).
const OCT7 = { from: '2026-10-07T05:00:00.000Z', to: '2026-10-08T05:00:00.000Z' };
const at = (hhmm: string) => `2026-10-07T${hhmm}:00.000Z`;

describe('CalendarService: fixed events', () => {
  it('creates events in Houston time, lists sleep first, and reports changes', () => {
    const { fixed, calendar, calendarChange } = setupCalendar();
    fixed(MATH);
    fixed(LUNCH);
    expect(fixed(SLEEP)).toMatchObject({ timeZone: 'America/Chicago', exceptions: [] });
    expect(calendar.listFixedEvents().map((e) => e.title)).toEqual(['Sleep', 'Lunch', 'MATH 2413']);
    expect(calendarChange).toHaveBeenCalledTimes(3);
  });

  it('protects the sleep floor and checks the rest on create and update', () => {
    const { fixed, updateFixed } = setupCalendar();
    expect(() => fixed({ ...SLEEP, startLocal: '00:00' })).toThrow(/at least 7 h 30 min/);
    const sleep = fixed(SLEEP);
    expect(() => updateFixed(sleep.id, { endLocal: '06:00' })).toThrow(/sleep floor/);
    expect(updateFixed(sleep.id, { endLocal: '07:00' }).endLocal).toBe('07:00');
    expect(() => fixed({ ...MATH, endLocal: '10:00' })).toThrow(/end time/);
    expect(() => fixed({ ...MATH, startDate: '2027-01-11' })).toThrow(/ends before/);
    expect(() => fixed({ ...MATH, courseId: '6f1d2c1e-8b1a-4c1e-9a3e-2f0b1c2d3e4f' })).toThrow(
      /Course not found/,
    );
  });

  it('skips one class and brings it back; never skips sleep', () => {
    const { fixed, calendar } = setupCalendar();
    const math = fixed(MATH);
    const sleep = fixed(SLEEP);
    calendar.skipOccurrence({ id: math.id, date: '2026-10-07', skip: true });
    expect(calendar.range(OCT7.from, OCT7.to).occurrences.map((o) => o.title)).toEqual([
      'Sleep',
      'Sleep',
    ]);
    expect(() => calendar.skipOccurrence({ id: math.id, date: '2026-10-08', skip: true })).toThrow(
      /doesn't happen on 2026-10-08/,
    );
    expect(() => calendar.skipOccurrence({ id: sleep.id, date: '2026-10-07', skip: true })).toThrow(
      /can't be skipped/,
    );
    expect(
      calendar.skipOccurrence({ id: math.id, date: '2026-10-07', skip: false }).exceptions,
    ).toEqual([]);
    expect(calendar.range(OCT7.from, OCT7.to).occurrences).toHaveLength(3);
  });

  it('drops skipped dates when an event becomes sleep', () => {
    const { fixed, updateFixed, calendar } = setupCalendar();
    const nap = fixed({ ...LUNCH, title: 'Rest' });
    calendar.skipOccurrence({ id: nap.id, date: '2026-10-07', skip: true });
    expect(
      updateFixed(nap.id, { kind: 'sleep', startLocal: '22:30', endLocal: '06:00' }).exceptions,
    ).toEqual([]);
  });
});

describe('CalendarService: range', () => {
  it('shows the week of the November change at the same local times', () => {
    const { fixed, calendar, course } = setupCalendar();
    const calc = course('Calculus I', 'MATH 2413');
    fixed({ ...MATH, courseId: calc.id });
    fixed(SLEEP);
    fixed(LUNCH);
    // Sun Nov 1 – Sat Nov 7, 2026 in Houston; clocks fall back Sunday at 2 am.
    const week = calendar.range('2026-11-01T05:00:00.000Z', '2026-11-08T06:00:00.000Z');
    const classes = week.occurrences.filter((o) => o.kind === 'class');
    expect(classes.map((o) => [o.date, o.startAt])).toEqual([
      ['2026-11-02', '2026-11-02T16:00:00.000Z'],
      ['2026-11-04', '2026-11-04T16:00:00.000Z'],
      ['2026-11-06', '2026-11-06T16:00:00.000Z'],
    ]);
    expect(classes[0]).toMatchObject({ color: calc.color, location: 'PGH 232' });
    // Saturday night before the change (in range from midnight) is 8.5 hours long.
    const night = week.occurrences.find((o) => o.kind === 'sleep' && o.date === '2026-10-31');
    expect(night).toMatchObject({
      startAt: '2026-11-01T04:00:00.000Z',
      endAt: '2026-11-01T12:30:00.000Z',
    });
    expect(week.occurrences.find((o) => o.kind === 'meal')).toMatchObject({
      color: '#f59e0b',
      startAt: '2026-11-01T18:00:00.000Z',
    });
    expect(week.nightsWithoutSleep).toEqual([]);
  });

  it('lists nights from today on that the routine leaves without sleep', () => {
    const { fixed, calendar } = setupCalendar();
    expect(calendar.range(OCT7.from, OCT7.to).nightsWithoutSleep).toEqual(['2026-10-07']);
    fixed({ ...SLEEP, rrule: 'FREQ=DAILY;BYDAY=SU,MO,TU,WE,TH' });
    // Sun Oct 4 – Sat Oct 10; today is Wednesday, so only Fri and Sat count.
    expect(
      calendar.range('2026-10-04T05:00:00.000Z', '2026-10-11T05:00:00.000Z').nightsWithoutSleep,
    ).toEqual(['2026-10-09', '2026-10-10']);
    expect(
      calendar.range('2026-09-27T05:00:00.000Z', '2026-10-04T05:00:00.000Z').nightsWithoutSleep,
    ).toEqual([]);
  });

  it('refuses empty and overly long ranges', () => {
    const { calendar } = setupCalendar();
    expect(() => calendar.range(OCT7.to, OCT7.from)).toThrow(/end after/);
    expect(() => calendar.range('2026-10-01T00:00:00Z', '2026-12-15T00:00:00Z')).toThrow(
      /at most 62 days/,
    );
  });
});

describe('CalendarService: blocks', () => {
  it('plans time for a task, with its title and course color', () => {
    const { fixed, block, calendar, task, course, timer, calendarChange } = setupCalendar();
    fixed(MATH);
    const calc = course('Calculus I', 'MATH 2413');
    const hw = task('Calc HW 4', { courseId: calc.id });
    const b = block({ taskId: hw.id, startAt: at('16:00'), endAt: '2026-10-07T17:00:00Z' });
    expect(b).toMatchObject({ source: 'manual', locked: false, endAt: at('17:00') });
    expect(calendarChange).toHaveBeenCalledTimes(2);
    timer.start(hw.id);
    expect(calendar.range(OCT7.from, OCT7.to).blocks).toEqual([
      expect.objectContaining({
        id: b.id,
        label: 'Calc HW 4',
        color: calc.color,
        conflict: null,
        task: expect.objectContaining({ title: 'Calc HW 4', running: true, status: 'open' }),
      }),
    ]);
  });

  it('needs a task or a title, a sane length, and an open task', () => {
    const { block, task, complete } = setupCalendar();
    expect(() => block({ startAt: at('16:00'), endAt: at('17:00') })).toThrow(/title/);
    expect(block({ title: 'Review notes', startAt: at('16:00'), endAt: at('17:00') }).title).toBe(
      'Review notes',
    );
    expect(() => block({ title: 'x', startAt: at('17:00'), endAt: at('17:00') })).toThrow(
      /end after/,
    );
    expect(() =>
      block({ title: 'x', startAt: at('17:00'), endAt: '2026-10-08T18:00:00.000Z' }),
    ).toThrow(/24 hours/);
    const done = task('Done already');
    complete(done.id);
    expect(() => block({ taskId: done.id, startAt: at('18:00'), endAt: at('19:00') })).toThrow(
      /already done/,
    );
  });

  it('keeps focus blocks out of classes, meals, sleep and each other', () => {
    const { fixed, block, task } = setupCalendar();
    fixed(MATH); // 15:00–15:50Z
    fixed(SLEEP); // 04:00–11:30Z
    fixed(LUNCH); // 17:00–17:30Z
    const essay = task('Essay');
    block({ taskId: essay.id, startAt: at('18:00'), endAt: at('19:00') });
    const try_ = (from: string, to: string) => () =>
      block({ title: 'Study', startAt: at(from), endAt: at(to) });
    expect(try_('15:30', '16:00')).toThrow(/overlaps MATH 2413 \(10:00 AM – 10:50 AM\)/);
    expect(try_('11:00', '12:00')).toThrow(/overlaps Sleep/);
    expect(try_('17:15', '17:45')).toThrow(/overlaps Lunch/);
    expect(try_('18:30', '19:30')).toThrow(/overlaps Essay/);
    // Back to back is fine.
    expect(try_('15:50', '17:00')).not.toThrow();
  });

  it('lets a background task run alongside a meal, but not a class or sleep', () => {
    const { fixed, block, task } = setupCalendar();
    fixed(MATH);
    fixed(SLEEP);
    fixed(LUNCH);
    const laundry = task('Laundry', { attention: 'background' });
    expect(block({ taskId: laundry.id, startAt: at('16:30'), endAt: at('17:30') })).toBeDefined();
    expect(() => block({ taskId: laundry.id, startAt: at('14:30'), endAt: at('16:00') })).toThrow(
      /MATH 2413/,
    );
    expect(() => block({ taskId: laundry.id, startAt: at('11:00'), endAt: at('12:00') })).toThrow(
      /Sleep/,
    );
  });

  it('re-checks moves but not locking, and shows conflicts that appear later', () => {
    const { fixed, block, updateBlock, calendar } = setupCalendar();
    const b = block({ title: 'Study', startAt: at('16:00'), endAt: at('17:00') });
    const c = block({ title: 'Read', startAt: at('18:00'), endAt: at('19:00') });
    expect(() => updateBlock(c.id, { startAt: at('16:30') })).toThrow(/overlaps Study/);
    expect(updateBlock(c.id, { startAt: at('17:00') }).startAt).toBe(at('17:00'));
    // A class added over the block afterwards: the block stays, flagged.
    fixed({ ...MATH, startLocal: '11:00', endLocal: '11:30' });
    expect(updateBlock(b.id, { locked: true }).locked).toBe(true);
    expect(calendar.range(OCT7.from, OCT7.to).blocks[0]?.conflict).toBe(
      'MATH 2413 (11:00 AM – 11:30 AM)',
    );
    expect(() => updateBlock(b.id, { title: '' })).toThrow(/title/);
  });

  it('goes away with its task, and on delete', () => {
    const { block, calendar, task, tasks } = setupCalendar();
    const hw = task('HW');
    block({ taskId: hw.id, startAt: at('16:00'), endAt: at('17:00') });
    const other = block({ title: 'Gym', startAt: at('18:00'), endAt: at('19:00') });
    tasks.delete(hw.id);
    expect(calendar.range(OCT7.from, OCT7.to).blocks.map((b) => b.label)).toEqual(['Gym']);
    calendar.deleteBlock(other.id);
    expect(calendar.range(OCT7.from, OCT7.to).blocks).toEqual([]);
    expect(() => calendar.deleteBlock(other.id)).toThrow(/not found/);
  });
});
