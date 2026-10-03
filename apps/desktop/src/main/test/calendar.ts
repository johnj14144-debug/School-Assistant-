import {
  blockCreateSchema,
  blockUpdateSchema,
  fixedEventCreateSchema,
  fixedEventUpdateSchema,
} from '@sa/core';
import { vi } from 'vitest';
import { CalendarService } from '../features/calendar/service';
import { setupTasks } from './tasks';

/** Task, timer and calendar services on one fresh database, with a controllable clock. */
export function setupCalendar(start = '2026-10-07T15:00:00.000Z') {
  const base = setupTasks(start);
  const calendarChange = vi.fn();
  const calendar = new CalendarService({
    db: base.database.db,
    settings: base.settings,
    now: base.clock.now,
    displayZone: () => 'America/Chicago',
    onChange: calendarChange,
  });
  // Inputs go through the IPC schemas, so defaults apply as in the app.
  const fixed = (fields: object) => calendar.createFixedEvent(fixedEventCreateSchema.parse(fields));
  const updateFixed = (id: string, patch: object) =>
    calendar.updateFixedEvent(fixedEventUpdateSchema.parse({ id, ...patch }));
  const block = (fields: object) => calendar.createBlock(blockCreateSchema.parse(fields));
  const updateBlock = (id: string, patch: object) =>
    calendar.updateBlock(blockUpdateSchema.parse({ id, ...patch }));
  return { ...base, calendar, calendarChange, fixed, updateFixed, block, updateBlock };
}
