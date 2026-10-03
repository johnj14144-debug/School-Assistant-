import { agendaNow } from '@sa/core';
import { useMemo } from 'react';
import { useLiveQuery } from '../../lib/useIpc';
import { type AgendaItem, agendaItems, todayAndTomorrow } from '../calendar/events';

export interface TodayAgenda {
  /** Today's occurrences and blocks in time order. */
  today: AgendaItem[];
  current: AgendaItem | null;
  /** May be tomorrow morning's first item. */
  next: AgendaItem | null;
}

/** The calendar for today (and tomorrow, for "next up"); null until loaded. */
export function useTodayAgenda(now: Date): TodayAgenda | null {
  const dayKey = now.toDateString();
  // biome-ignore lint/correctness/useExhaustiveDependencies: recomputed once per local day.
  const range = useMemo(() => todayAndTomorrow(now), [dayKey]);
  const { data } = useLiveQuery(
    'calendar:range',
    { from: range.from, to: range.to },
    `${range.from}|${range.to}`,
  );
  if (!data) return null;
  const items = agendaItems(data);
  return {
    today: items.filter((i) => i.startAt < range.dayEnd && i.endAt > range.from),
    ...agendaNow(items, now),
  };
}
