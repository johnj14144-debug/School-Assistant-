import {
  DEFAULT_TIME_ZONE,
  FIXED_EVENT_COLORS,
  type FixedEvent,
  type FixedEventKind,
  formatLocalDate,
} from '@sa/core';
import { ArrowLeft, Plus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Button } from '../../components/Button';
import { todayLocal } from '../../lib/dates';
import { useIpcQuery, useLiveQuery } from '../../lib/useIpc';
import { useTaskActions } from '../timer/TaskActions';
import { type Editing, FixedEventDialog } from './FixedEventDialog';
import {
  describeRepeat,
  formatDayText,
  formatWallTime,
  formFromEvent,
  KIND_LABELS,
  newForm,
  starterRoutine,
} from './routine';

const GROUPS: { title: string; kinds: FixedEventKind[]; add: FixedEventKind[] }[] = [
  {
    title: 'Sleep and daily routine',
    kinds: ['sleep', 'hygiene', 'meal'],
    add: ['sleep', 'meal', 'hygiene'],
  },
  { title: 'Classes', kinds: ['class'], add: ['class'] },
  { title: 'Other', kinds: ['other'], add: ['other'] },
];

function EventRow({
  event,
  color,
  today,
  onEdit,
}: {
  event: FixedEvent;
  color: string;
  today: string;
  onEdit: () => void;
}) {
  const { run } = useTaskActions();
  const thisYear = Number(today.slice(0, 4));
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <span className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ background: color }} />
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {event.title}
          {event.location && <span className="font-normal text-zinc-500"> · {event.location}</span>}
        </p>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {formatWallTime(event.startLocal)} – {formatWallTime(event.endLocal)} ·{' '}
          {describeRepeat(event, today)}
          {event.timeZone !== DEFAULT_TIME_ZONE && ` · ${event.timeZone} time`}
        </p>
        {event.exceptions.length > 0 && (
          <p className="mt-1 flex flex-wrap items-center gap-1 text-xs text-zinc-500">
            Skipped:
            {event.exceptions.map((date) => (
              <span
                key={date}
                className="flex items-center gap-0.5 rounded bg-zinc-100 py-0.5 pl-1.5 pr-0.5 dark:bg-zinc-800"
              >
                {formatDayText(date, thisYear)}
                <button
                  type="button"
                  aria-label={`Bring back ${date}`}
                  title="Bring this day back"
                  className="rounded p-0.5 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                  onClick={() =>
                    void run(() =>
                      window.api.invoke('fixed-event:skip', { id: event.id, date, skip: false }),
                    )
                  }
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </p>
        )}
      </div>
      <Button onClick={onEdit}>Edit</Button>
      <Button
        variant="danger"
        onClick={() => {
          if (window.confirm(`Delete "${event.title}" from your routine?`)) {
            void run(() => window.api.invoke('fixed-event:delete', { id: event.id }));
          }
        }}
      >
        Delete
      </Button>
    </div>
  );
}

/**
 * The weekly routine the planner works around: sleep (never below the floor), hygiene, meals,
 * the UH class schedule and anything else that repeats. Times are local to each event's zone.
 */
export function RoutinePage() {
  const { run } = useTaskActions();
  const { data: events } = useLiveQuery('fixed-event:list');
  const { data: courses } = useIpcQuery('course:list');
  const [editing, setEditing] = useState<Editing | null>(null);
  const [params, setParams] = useSearchParams();
  const today = formatLocalDate(todayLocal());
  const editId = params.get('edit');

  // "Edit in routine" from the calendar opens that event's form.
  useEffect(() => {
    if (!editId || !events) return;
    const event = events.find((e) => e.id === editId);
    if (event) setEditing({ id: event.id, form: formFromEvent(event) });
    setParams({}, { replace: true });
  }, [editId, events, setParams]);

  const colorOf = (e: FixedEvent) =>
    courses?.find((c) => c.id === e.courseId)?.color ?? FIXED_EVENT_COLORS[e.kind];

  async function addStarter() {
    await run(async () => {
      for (const input of starterRoutine(today)) {
        await window.api.invoke('fixed-event:create', input);
      }
    });
  }

  return (
    <div className="mx-auto max-w-4xl px-10 py-12">
      <Link
        to="/calendar"
        className="flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
      >
        <ArrowLeft className="size-4" /> Calendar
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Routine</h1>
      <p className="mt-1 text-zinc-600 dark:text-zinc-400">
        What happens every week. The planner keeps these times free and never plans into your sleep
        (at least 7.5 hours a night, even when the clocks change).
      </p>

      {events && events.length === 0 && (
        <div className="mt-8 rounded-xl border border-dashed border-zinc-300 p-6 dark:border-zinc-700">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Start from a basic day (sleep 11 PM – 6:30 AM, morning and evening routines, breakfast
            7–8 AM and dinner 8–9 PM) and adjust it, or add events one by one below.
          </p>
          <Button variant="primary" className="mt-3" onClick={() => void addStarter()}>
            Add a starter routine
          </Button>
        </div>
      )}

      {GROUPS.map((group) => {
        const rows = (events ?? []).filter((e) => group.kinds.includes(e.kind));
        return (
          <section key={group.title} className="mt-10">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="flex-1 text-lg font-semibold">{group.title}</h2>
              {group.add.map((kind) => (
                <Button
                  key={kind}
                  className="flex items-center gap-1"
                  onClick={() => setEditing({ id: null, form: newForm(kind, today) })}
                >
                  <Plus className="size-4" /> {KIND_LABELS[kind]}
                </Button>
              ))}
            </div>
            {rows.length > 0 ? (
              <div className="mt-3 divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
                {rows.map((event) => (
                  <EventRow
                    key={event.id}
                    event={event}
                    color={colorOf(event)}
                    today={today}
                    onEdit={() => setEditing({ id: event.id, form: formFromEvent(event) })}
                  />
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-zinc-500">
                {group.kinds.includes('class')
                  ? 'Add each class with its days, times and the first and last day of the term.'
                  : group.kinds.includes('other')
                    ? 'Tutoring, chapter meetings and other commitments. Background tasks like laundry are never planned over them.'
                    : 'Nothing here yet.'}
              </p>
            )}
          </section>
        );
      })}

      <FixedEventDialog
        editing={editing}
        courses={courses ?? []}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}
