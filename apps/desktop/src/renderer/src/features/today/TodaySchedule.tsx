import { formatMinutes } from '@sa/core';
import { CalendarDays, Lock, Play } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '../../components/Button';
import { cn } from '../../lib/cn';
import { formatTime } from '../../lib/dates';
import type { AgendaItem } from '../calendar/events';
import { useTaskActions } from '../timer/TaskActions';
import type { TodayAgenda } from './useTodayAgenda';

function StartButton({ item, label }: { item: AgendaItem; label: string }) {
  const { start } = useTaskActions();
  if (item.item.kind !== 'block') return null;
  const { task } = item.item.block;
  if (task?.status !== 'open') return null;
  if (task.running) {
    return (
      <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Running</span>
    );
  }
  return (
    <Button
      variant="primary"
      className="flex items-center gap-1.5"
      onClick={() => void start(task.id)}
    >
      <Play className="size-4" /> {label}
    </Button>
  );
}

function Card({
  heading,
  item,
  detail,
  action,
}: {
  heading: string;
  item: AgendaItem | null;
  detail: string;
  action?: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
      <span
        className="h-10 w-1 shrink-0 rounded-full"
        style={{ background: item?.color ?? 'transparent' }}
      />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{heading}</p>
        <p className="truncate font-medium">{item ? item.title : 'Free time'}</p>
        <p className="text-sm text-zinc-500">{detail}</p>
      </div>
      {item && action && <StartButton item={item} label={action} />}
    </div>
  );
}

const minutesBetween = (from: Date, to: string) =>
  Math.max(1, Math.round((Date.parse(to) - from.getTime()) / 60_000));

/** What the calendar says now and next, and the rest of today's schedule. */
export function TodaySchedule({ agenda, now }: { agenda: TodayAgenda; now: Date }) {
  const { today, current, next } = agenda;
  if (today.length === 0 && !next) {
    return (
      <p className="mt-4 flex items-center gap-2 text-sm text-zinc-500">
        <CalendarDays className="size-4" />
        Nothing on the calendar today.{' '}
        <Link to="/calendar" className="text-indigo-700 hover:underline dark:text-indigo-300">
          Plan your day
        </Link>
      </p>
    );
  }

  const nowDetail = current
    ? `until ${formatTime(current.endAt)} · ${formatMinutes(minutesBetween(now, current.endAt))} left`
    : next
      ? `until ${formatTime(next.startAt)}`
      : 'for the rest of the day';
  const nextDetail = next
    ? `${formatTime(next.startAt)} – ${formatTime(next.endAt)} · in ${formatMinutes(minutesBetween(now, next.startAt))}`
    : 'nothing else planned';

  return (
    <section className="mt-6" aria-label="Schedule">
      <div className="grid gap-3 md:grid-cols-2">
        <Card heading="Now" item={current} detail={nowDetail} action="Start" />
        <Card heading="Next up" item={next} detail={nextDetail} action="Start early" />
      </div>
      <details className="mt-3 rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <summary className="cursor-pointer px-4 py-2 text-sm text-zinc-600 dark:text-zinc-400">
          Today’s schedule ({today.length})
          <Link
            to="/calendar"
            className="float-right text-indigo-700 hover:underline dark:text-indigo-300"
          >
            Open calendar
          </Link>
        </summary>
        <ul className="divide-y divide-zinc-100 border-t border-zinc-100 dark:divide-zinc-800 dark:border-zinc-800">
          {today.map((i) => {
            const past = Date.parse(i.endAt) <= now.getTime();
            const isNow = current?.key === i.key;
            return (
              <li
                key={i.key}
                className={cn(
                  'flex items-center gap-3 px-4 py-1.5 text-sm',
                  past && 'text-zinc-400 dark:text-zinc-600',
                  isNow && 'bg-indigo-50/60 font-medium dark:bg-indigo-500/10',
                )}
              >
                <span className="size-2 shrink-0 rounded-full" style={{ background: i.color }} />
                <span className="w-44 shrink-0 whitespace-nowrap tabular-nums">
                  {formatTime(i.startAt)} – {formatTime(i.endAt)}
                </span>
                <span className="min-w-0 flex-1 truncate">{i.title}</span>
                {i.item.kind === 'block' && i.item.block.locked && (
                  <Lock className="size-3.5 text-zinc-400" aria-label="Locked" />
                )}
              </li>
            );
          })}
        </ul>
      </details>
    </section>
  );
}
