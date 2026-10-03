import { formatClock, formatMinutes, type TaskListItem, type TimerState } from '@sa/core';
import { Check, Clock, Pause, Play, Square } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { inputClass } from '../../components/inputs';
import { cn } from '../../lib/cn';
import { formatTime } from '../../lib/dates';
import { useLiveQuery } from '../../lib/useIpc';
import { useNow } from '../../lib/useNow';
import { plannedTaskId } from '../calendar/events';
import { BehindBanner } from '../planner/BehindBanner';
import { QuickAddInput } from '../tasks/QuickAddInput';
import { TaskRow } from '../tasks/TaskRow';
import { useTaskActions } from '../timer/TaskActions';
import { elapsedSeconds, TotalVsEstimate } from '../timer/TimerBar';
import { TodayList } from './TodayList';
import { TodaySchedule } from './TodaySchedule';
import { useTodayAgenda } from './useTodayAgenda';

function BigButton({
  onClick,
  children,
  variant = 'secondary',
}: {
  onClick: () => void;
  children: ReactNode;
  variant?: 'go' | 'pause' | 'secondary';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 rounded-xl px-5 py-3 text-base font-semibold transition-colors',
        variant === 'go' && 'bg-emerald-600 text-white hover:bg-emerald-500',
        variant === 'pause' && 'bg-amber-500 text-white hover:bg-amber-400',
        variant === 'secondary' &&
          'border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800',
      )}
    >
      {children}
    </button>
  );
}

/** The big card: the running or paused task with its clock, or what's next with Start. */
function NowCard({
  timer,
  next,
  planned,
  now,
}: {
  timer: TimerState | null;
  next: TaskListItem | undefined;
  /** `next` is the task of the block planned for now. */
  planned: boolean;
  now: Date;
}) {
  const { start, pause, resume, stop, complete, startEarlier } = useTaskActions();
  const focus = timer?.focus ?? null;
  const current = focus ?? timer?.paused ?? null;

  if (!current) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-900">
        {next ? (
          <>
            <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">
              {planned ? 'Planned now' : 'Up next'}
            </p>
            <Link
              to={`/tasks/${next.id}`}
              className="mt-1 block text-2xl font-semibold hover:text-indigo-700 dark:hover:text-indigo-300"
            >
              {next.title}
            </Link>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <BigButton variant="go" onClick={() => void start(next.id)}>
                <Play className="size-5" /> Start
              </BigButton>
              <button
                type="button"
                className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                onClick={() => startEarlier(next)}
              >
                <Clock className="size-4" /> I started at…
              </button>
            </div>
          </>
        ) : (
          <p className="text-zinc-500">
            Nothing on today’s list. Add tasks below, or press the sun on any task.
          </p>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'rounded-2xl border p-8',
        focus
          ? 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-500/5'
          : 'border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-500/5',
      )}
    >
      <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">
        {focus ? 'Now' : 'Paused'}
      </p>
      <Link
        to={`/tasks/${current.task.id}`}
        className="mt-1 block text-2xl font-semibold hover:text-indigo-700 dark:hover:text-indigo-300"
      >
        {current.task.title}
      </Link>
      <div className="mt-4 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        {focus?.session && (
          <span className="font-mono text-5xl font-semibold tabular-nums" data-testid="now-clock">
            {formatClock(elapsedSeconds(focus, now))}
          </span>
        )}
        <span className="text-sm">
          <TotalVsEstimate entry={current} now={now} />
          <span className="text-zinc-500"> on this task</span>
        </span>
        {focus?.session && (
          <button
            type="button"
            className="text-sm text-zinc-500 underline-offset-2 hover:underline"
            onClick={() => startEarlier(focus.task)}
          >
            started {formatTime(focus.session.startAt)}
          </button>
        )}
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        {focus ? (
          <BigButton variant="pause" onClick={() => void pause()}>
            <Pause className="size-5" /> Pause
          </BigButton>
        ) : (
          <BigButton variant="go" onClick={() => void resume()}>
            <Play className="size-5" /> Resume
          </BigButton>
        )}
        <BigButton onClick={() => complete(current.task)}>
          <Check className="size-5" /> Done
        </BigButton>
        <BigButton onClick={() => void stop()}>
          <Square className="size-4" /> Stop
        </BigButton>
      </div>
    </div>
  );
}

/** A block starting this soon is offered on the big card. */
const SOON_MS = 10 * 60_000;

/** Run the day: the Today list in your order, a big Start/Stop, and what got done. */
export function TodayPage() {
  const now = useNow();
  const { timer, setToday } = useTaskActions();
  const { data, error } = useLiveQuery('today:get');
  const { data: open } = useLiveQuery('task:list', { status: 'open' });

  const title = now.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  const running = timer?.focus?.session;
  const runningToday =
    data && running
      ? Math.max(
          0,
          now.getTime() - Math.max(Date.parse(running.startAt), Date.parse(data.dayStart)),
        ) / 60_000
      : 0;
  const focusToday = (data?.focusMinClosed ?? 0) + runningToday;
  const agenda = useTodayAgenda(now);
  // The current block's task comes first, then a block starting in the next few minutes (a
  // re-plan starts on the 5-minute grid), then the top of the Today list.
  const planned = plannedTaskId(agenda?.current ?? null);
  const soon =
    agenda?.next && Date.parse(agenda.next.startAt) - now.getTime() <= SOON_MS
      ? plannedTaskId(agenda.next)
      : null;
  const next =
    (planned ? open?.find((t) => t.id === planned) : undefined) ??
    (soon ? open?.find((t) => t.id === soon) : undefined) ??
    data?.tasks.find((t) => t.attention !== 'background') ??
    data?.tasks[0];
  const notOnToday = (open ?? []).filter((t) => t.todayOrder === null);

  return (
    <div className="mx-auto max-w-4xl px-10 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-1 text-zinc-600 dark:text-zinc-400">
        Focused {formatMinutes(focusToday)} today
        {data && ` · ${data.tasks.length} to do · ${data.done.length} done`}
      </p>
      {error && <p className="mt-6 text-sm text-red-700">{error}</p>}

      <BehindBanner />
      <div className="mt-8">
        <NowCard timer={timer} next={next} planned={next?.id === planned} now={now} />
      </div>
      {agenda && <TodaySchedule agenda={agenda} now={now} />}

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Today’s list</h2>
        {data && data.tasks.length > 0 && (
          <div className="mt-3">
            <TodayList tasks={data.tasks} now={now} />
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-start gap-3">
          <QuickAddInput
            className="min-w-72 flex-1"
            aria-label="Add a task for today"
            placeholder="Add a task for today, e.g. “Read pages 45-60 ~40m #hist”"
            extra={{ today: true }}
          />
          {notOnToday.length > 0 && (
            <select
              className={cn(inputClass, 'w-64')}
              aria-label="Add one of your tasks to today"
              value=""
              onChange={(e) => e.target.value && void setToday(e.target.value, true)}
            >
              <option value="">Add one of your tasks…</option>
              {notOnToday.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.course ? `${t.course.code || t.course.name}: ` : ''}
                  {t.title}
                </option>
              ))}
            </select>
          )}
        </div>
      </section>

      {data && data.done.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold">Done today</h2>
          <div className="mt-3 divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
            {data.done.map((t) => (
              <div key={t.id}>
                <TaskRow task={t} now={now} todayToggle={false} />
                {t.completionNote && (
                  <p className="-mt-1 truncate px-9 pb-2 text-xs text-zinc-500">
                    {t.completionNote}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
