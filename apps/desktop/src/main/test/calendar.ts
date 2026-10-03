import {
  blockCreateSchema,
  blockUpdateSchema,
  fixedEventCreateSchema,
  fixedEventUpdateSchema,
  type PlanRun,
} from '@sa/core';
import { vi } from 'vitest';
import { CalendarService } from '../features/calendar/service';
import { PlannerService } from '../features/planner/service';
import { stubLogger } from './helpers';
import { setupTasks } from './tasks';

/**
 * Task, timer, calendar and planner services on one fresh database, with a controllable clock.
 * The services report plan events to the planner as in the app; an automatic re-plan waits
 * until the test calls `planner.flush()`.
 */
export function setupCalendar(start = '2026-10-07T15:00:00.000Z') {
  const base = setupTasks(start);
  const calendarChange = vi.fn();
  const calendar = new CalendarService({
    db: base.database.db,
    settings: base.settings,
    now: base.clock.now,
    displayZone: () => 'America/Chicago',
    onChange: calendarChange,
    onPlanEvent: base.onPlanEvent,
  });
  // Inputs go through the IPC schemas, so defaults apply as in the app.
  const fixed = (fields: object) => calendar.createFixedEvent(fixedEventCreateSchema.parse(fields));
  const updateFixed = (id: string, patch: object) =>
    calendar.updateFixedEvent(fixedEventUpdateSchema.parse({ id, ...patch }));
  const block = (fields: object) => calendar.createBlock(blockCreateSchema.parse(fields));
  const updateBlock = (id: string, patch: object) =>
    calendar.updateBlock(blockUpdateSchema.parse({ id, ...patch }));
  const replanned = vi.fn<(run: PlanRun) => void>();
  const log = stubLogger();
  const planner = new PlannerService({
    db: base.database.db,
    settings: base.settings,
    now: base.clock.now,
    displayZone: () => 'America/Chicago',
    onChange: calendarChange,
    onReplan: replanned,
    schedule: () => () => {},
    log,
  });
  base.onPlanEvent.mockImplementation(planner.notify);
  return {
    ...base,
    calendar,
    calendarChange,
    planner,
    replanned,
    log,
    fixed,
    updateFixed,
    block,
    updateBlock,
  };
}
