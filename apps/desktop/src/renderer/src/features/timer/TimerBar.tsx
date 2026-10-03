import { formatClock, formatMinutes, type TimerEntry } from '@sa/core';
import { Check, Pause, Play, Square } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { cn } from '../../lib/cn';
import { formatTime } from '../../lib/dates';
import { useNow } from '../../lib/useNow';
import { useTaskActions } from './TaskActions';

/** Seconds the entry's open session has run. */
export function elapsedSeconds(entry: TimerEntry, now: Date): number {
  return entry.session ? (now.getTime() - Date.parse(entry.session.startAt)) / 1000 : 0;
}

/** "1h 25m of 2h", red once over the estimate. */
export function TotalVsEstimate({ entry, now }: { entry: TimerEntry; now: Date }) {
  const total = entry.priorMin + elapsedSeconds(entry, now) / 60;
  const estimate = entry.task.estimateMin;
  const over = estimate !== null && total > estimate;
  return (
    <span className={cn('tabular-nums', over ? 'text-red-600 dark:text-red-400' : 'text-zinc-500')}>
      {formatMinutes(total)}
      {estimate !== null && ` of ${formatMinutes(estimate)}`}
    </span>
  );
}

function BarButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="grid size-7 place-items-center rounded-md text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
    >
      {children}
    </button>
  );
}

/** The timer, visible on every page: what runs, for how long, and its controls. */
export function TimerBar() {
  const { timer, pause, resume, stop, complete, startEarlier } = useTaskActions();
  const now = useNow();
  const focus = timer?.focus ?? null;
  const paused = timer?.paused ?? null;
  const current = focus ?? paused;

  return (
    <div
      data-testid="timer-bar"
      className="flex h-12 shrink-0 items-center gap-3 border-b border-zinc-200 bg-white px-4 text-sm dark:border-zinc-800 dark:bg-zinc-900"
    >
      {current ? (
        <>
          <span
            className={cn(
              'size-2.5 shrink-0 rounded-full',
              focus ? 'animate-pulse bg-emerald-500' : 'bg-amber-400',
            )}
            aria-hidden
          />
          <Link
            to={`/tasks/${current.task.id}`}
            className="min-w-0 truncate font-medium hover:text-indigo-700 dark:hover:text-indigo-300"
          >
            {paused && !focus && <span className="font-normal text-zinc-500">Paused: </span>}
            {current.task.title}
          </Link>
          {current.task.course && (
            <span className="hidden shrink-0 text-xs text-zinc-500 lg:inline">
              {current.task.course.code || current.task.course.name}
            </span>
          )}
          {focus?.session && (
            <>
              <span className="font-mono text-base tabular-nums" data-testid="timer-clock">
                {formatClock(elapsedSeconds(focus, now))}
              </span>
              <button
                type="button"
                className="shrink-0 text-xs text-zinc-500 underline-offset-2 hover:underline"
                title="Started earlier? Fix the start time"
                onClick={() => startEarlier(focus.task)}
              >
                since {formatTime(focus.session.startAt)}
              </button>
            </>
          )}
          <span className="hidden shrink-0 text-xs md:inline">
            <TotalVsEstimate entry={current} now={now} />
          </span>
          <div className="flex shrink-0 items-center gap-0.5">
            {focus ? (
              <BarButton label="Pause" onClick={() => void pause()}>
                <Pause className="size-4" />
              </BarButton>
            ) : (
              <BarButton label="Resume" onClick={() => void resume()}>
                <Play className="size-4" />
              </BarButton>
            )}
            <BarButton label="Done" onClick={() => complete(current.task)}>
              <Check className="size-4" />
            </BarButton>
            <BarButton label="Stop" onClick={() => void stop()}>
              <Square className="size-3.5" />
            </BarButton>
          </div>
        </>
      ) : (
        <span className="text-zinc-500">
          No timer running ·{' '}
          <kbd className="rounded border border-zinc-300 px-1 text-xs dark:border-zinc-700">
            Ctrl+K
          </kbd>{' '}
          to add or start a task
        </span>
      )}
      <div className="ml-auto flex min-w-0 items-center gap-2">
        {timer?.background.map((entry) => (
          <span
            key={entry.task.id}
            className="flex min-w-0 items-center gap-1.5 rounded-full bg-sky-50 py-0.5 pl-2.5 pr-1 text-xs text-sky-800 dark:bg-sky-500/15 dark:text-sky-300"
          >
            <Link to={`/tasks/${entry.task.id}`} className="max-w-40 truncate hover:underline">
              {entry.task.title}
            </Link>
            <span className="font-mono tabular-nums">
              {formatClock(elapsedSeconds(entry, now))}
            </span>
            <button
              type="button"
              aria-label={`Stop ${entry.task.title}`}
              title="Stop"
              className="grid size-5 place-items-center rounded-full hover:bg-sky-100 dark:hover:bg-sky-500/25"
              onClick={() => void stop(entry.task.id)}
            >
              <Square className="size-2.5" />
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}
