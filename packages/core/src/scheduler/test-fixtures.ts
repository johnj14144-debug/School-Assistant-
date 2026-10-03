import type { FixedEventKind } from '../calendar/schemas';
import { expandFixedEvents, type RecurringEvent } from '../time/expand';
import type { PlanFixed, PlannedBlock, PlanTask } from './plan';

/** Test helpers for the scheduler: the owner's routine and tasks with sensible defaults. */

export const ZONE = 'America/Chicago';

interface RoutineEvent extends RecurringEvent {
  kind: FixedEventKind;
  title: string;
}

const daily = (title: string, kind: FixedEventKind, startLocal: string, endLocal: string) =>
  ({
    title,
    kind,
    startDate: '2026-08-24',
    startLocal,
    endLocal,
    rrule: 'FREQ=DAILY',
    timeZone: ZONE,
    exceptions: [],
  }) satisfies RoutineEvent;

const weekly = (title: string, kind: FixedEventKind, days: string, start: string, end: string) =>
  ({
    ...daily(title, kind, start, end),
    rrule: `FREQ=WEEKLY;BYDAY=${days}`,
  }) satisfies RoutineEvent;

/** The starter routine plus five classes and tutoring (VISION, owner decision Q10). */
export const ROUTINE: RoutineEvent[] = [
  daily('Sleep', 'sleep', '23:00', '06:30'),
  daily('Morning routine', 'hygiene', '06:30', '07:00'),
  daily('Breakfast', 'meal', '07:00', '08:00'),
  daily('Dinner', 'meal', '20:00', '21:00'),
  daily('Evening routine', 'hygiene', '22:30', '23:00'),
  weekly('MATH 2413', 'class', 'MO,WE,FR', '10:00', '10:50'),
  weekly('CHEM 1311', 'class', 'MO,WE,FR', '12:00', '12:50'),
  weekly('ENGL 1304', 'class', 'TU,TH', '08:30', '09:50'),
  weekly('HIST 1377', 'class', 'TU,TH', '11:30', '12:50'),
  weekly('COSC 1336', 'class', 'TU,TH', '14:30', '15:50'),
  weekly('Tutoring', 'other', 'WE', '16:00', '18:00'),
];

export function fixedBetween(
  from: string,
  until: string,
  events: readonly RoutineEvent[] = ROUTINE,
): PlanFixed[] {
  return expandFixedEvents(events, from, until).map((o) => ({
    kind: o.event.kind,
    startAt: o.startAt,
    endAt: o.endAt,
  }));
}

let counter = 0;

/** A focus task with a fresh id; `id` and `title` default from a counter. */
export function planTask(fields: Partial<PlanTask> = {}): PlanTask {
  counter++;
  const id = fields.id ?? `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`;
  return {
    id,
    title: `Task ${counter}`,
    subject: `course-${counter}`,
    priority: 'normal',
    background: false,
    remainingMin: 60,
    estimated: true,
    // Far beyond any test week unless a test sets one.
    dueAt: '2026-12-31T23:59:00.000Z',
    deadline: 'hard',
    earliestStartAt: null,
    splittable: true,
    minChunkMin: 30,
    steps: [],
    createdAt: `2026-10-01T00:00:${String(counter % 60).padStart(2, '0')}.000Z`,
    ...fields,
  };
}

export const ms = (iso: string) => Date.parse(iso);
export const minutesOf = (b: Pick<PlannedBlock, 'startAt' | 'endAt'>) =>
  (ms(b.endAt) - ms(b.startAt)) / 60_000;

export function overlaps(
  a: { startAt: string; endAt: string },
  b: { startAt: string; endAt: string },
): boolean {
  return ms(a.startAt) < ms(b.endAt) && ms(b.startAt) < ms(a.endAt);
}

/** Local "Mon 9:00" for readable assertions. */
export function local(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: ZONE,
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hourCycle: 'h23',
  })
    .format(ms(iso))
    .replace(',', '')
    .replace(/ 0(\d):/, ' $1:');
}
