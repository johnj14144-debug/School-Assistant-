import type { HandlersFor } from '../../ipc';
import type { CalendarService } from './service';

export function calendarHandlers(
  calendar: CalendarService,
): HandlersFor<'fixed-event' | 'block' | 'calendar'> {
  return {
    'fixed-event:list': () => calendar.listFixedEvents(),
    'fixed-event:create': (input) => calendar.createFixedEvent(input),
    'fixed-event:update': (input) => calendar.updateFixedEvent(input),
    'fixed-event:delete': ({ id }) => calendar.deleteFixedEvent(id),
    'fixed-event:skip': (input) => calendar.skipOccurrence(input),
    'block:create': (input) => calendar.createBlock(input),
    'block:update': (input) => calendar.updateBlock(input),
    'block:delete': ({ id }) => calendar.deleteBlock(id),
    'calendar:range': ({ from, to }) => calendar.range(from, to),
  };
}
