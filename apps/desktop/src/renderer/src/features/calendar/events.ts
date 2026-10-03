import type { EventInput } from '@fullcalendar/react';
import type { BlockView, CalendarRange, OccurrenceView } from '@sa/core';

/**
 * Calendar data → what FullCalendar and the Today page show. Pure, so it can be unit-tested.
 * Fixed events (classes, sleep, meals) are tinted and stay in place; blocks are solid and can
 * be dragged unless locked or done.
 */

export type CalendarItem =
  | { kind: 'fixed'; occurrence: OccurrenceView }
  | { kind: 'block'; block: BlockView };

const FIXED_PREFIX = 'fixed:';
const BLOCK_PREFIX = 'block:';

/** The FullCalendar event id of an occurrence (one per event per day) or a block. */
export const occurrenceId = (o: Pick<OccurrenceView, 'eventId' | 'date'>) =>
  `${FIXED_PREFIX}${o.eventId}:${o.date}`;
export const blockEventId = (b: Pick<BlockView, 'id'>) => `${BLOCK_PREFIX}${b.id}`;

export function blockClassNames(block: BlockView): string {
  return [
    'sa-block',
    block.locked && 'sa-locked',
    block.conflict && 'sa-conflict',
    block.task?.status === 'done' && 'sa-done',
    block.task?.running && 'sa-running',
  ]
    .filter(Boolean)
    .join(' ');
}

export function toEventInputs(range: CalendarRange): EventInput[] {
  const fixed = range.occurrences.map(
    (o): EventInput => ({
      id: occurrenceId(o),
      title: o.title,
      start: o.startAt,
      end: o.endAt,
      // The theme draws a soft tint of this color with readable text in either mode.
      color: o.color,
      editable: false,
      className: `sa-fixed sa-fixed-${o.kind}`,
      item: { kind: 'fixed', occurrence: o } satisfies CalendarItem,
    }),
  );
  const blocks = range.blocks.map(
    (b): EventInput => ({
      id: blockEventId(b),
      title: b.label,
      start: b.startAt,
      end: b.endAt,
      // Solid (styles.css), so planned work stands out from the routine.
      color: b.color,
      contrastColor: '#ffffff',
      editable: !b.locked && b.task?.status !== 'done',
      className: blockClassNames(b),
      item: { kind: 'block', block: b } satisfies CalendarItem,
    }),
  );
  return [...fixed, ...blocks];
}

/** How long a block for a task should be when dropped on the calendar: what's left, 15 min–4 h. */
export function blockMinutesFor(task: { estimateMin: number | null; actualMin: number }): number {
  if (task.estimateMin === null) return 60;
  const remaining = task.estimateMin - task.actualMin;
  if (remaining <= 0) return 30;
  return Math.min(240, Math.max(15, Math.round(remaining / 5) * 5));
}

/** The local week (Sunday 00:00 to the next Sunday) around `now`, as UTC instants. */
export function weekAround(now: Date): { from: string; to: string } {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
  return { from: start.toISOString(), to: end.toISOString() };
}

/** Local midnight today to local midnight two days later (today plus tomorrow's "next up"). */
export function todayAndTomorrow(now: Date): { from: string; to: string; dayEnd: string } {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2);
  return { from: start.toISOString(), to: end.toISOString(), dayEnd: dayEnd.toISOString() };
}

export interface AgendaItem {
  key: string;
  kind: 'block' | 'fixed';
  background: boolean;
  startAt: string;
  endAt: string;
  title: string;
  color: string;
  item: CalendarItem;
}

/** Occurrences and blocks as one list in time order (the Today page's schedule). */
export function agendaItems(range: CalendarRange): AgendaItem[] {
  const items: AgendaItem[] = [
    ...range.occurrences.map(
      (o): AgendaItem => ({
        key: occurrenceId(o),
        kind: 'fixed',
        background: false,
        startAt: o.startAt,
        endAt: o.endAt,
        title: o.location ? `${o.title} · ${o.location}` : o.title,
        color: o.color,
        item: { kind: 'fixed', occurrence: o },
      }),
    ),
    ...range.blocks.map(
      (b): AgendaItem => ({
        key: blockEventId(b),
        kind: 'block',
        background: b.task?.attention === 'background',
        startAt: b.startAt,
        endAt: b.endAt,
        title: b.label,
        color: b.color,
        item: { kind: 'block', block: b },
      }),
    ),
  ];
  return items.sort((a, b) => a.startAt.localeCompare(b.startAt) || a.kind.localeCompare(b.kind));
}

/** The open focus task the current block is for (the Today page offers it first), or null. */
export function plannedTaskId(current: AgendaItem | null): string | null {
  if (current?.item.kind !== 'block') return null;
  const { task } = current.item.block;
  return task && task.status === 'open' && task.attention !== 'background' ? task.id : null;
}
