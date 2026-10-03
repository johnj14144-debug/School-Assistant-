import { formatMinutes, type TaskListItem } from '@sa/core';
import { Pause, Play, Square, Sun } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { cn } from '../../lib/cn';
import { dueStatus, formatTaskDue } from '../../lib/dates';
import { useTaskActions } from '../timer/TaskActions';
import { quantityText } from './format';

const dueClass = {
  none: '',
  overdue: 'text-red-600 dark:text-red-400',
  today: 'text-amber-600 dark:text-amber-400',
  week: 'text-zinc-600 dark:text-zinc-300',
  later: 'text-zinc-500',
};

/** "45m of 1h": time on the task (with subtasks) against its estimate. */
export function TimeVsEstimate({ task }: { task: TaskListItem }) {
  if (task.actualMin < 0.5 && task.estimateMin === null) return null;
  const over = task.estimateMin !== null && task.actualMin > task.estimateMin;
  return (
    <span
      className={cn(
        'tabular-nums',
        over ? 'text-red-600 dark:text-red-400' : 'text-zinc-500',
        task.running && 'font-medium text-emerald-700 dark:text-emerald-400',
      )}
      title="Time spent (with subtasks) of the estimate"
    >
      {task.actualMin >= 0.5 ? formatMinutes(task.actualMin) : '—'}
      {task.estimateMin !== null && ` of ${formatMinutes(task.estimateMin)}`}
    </span>
  );
}

interface TaskRowProps {
  task: TaskListItem;
  now: Date;
  /** Show the sun button that puts the task on the Today list. */
  todayToggle?: boolean;
  /** Leading content, e.g. a drag handle. */
  leading?: ReactNode;
  className?: string;
}

/** One task: done box, title and details, time vs estimate, start/pause, Today toggle. */
export function TaskRow({ task, now, todayToggle = true, leading, className }: TaskRowProps) {
  const { timer, start, pause, stop, complete, reopen, setToday } = useTaskActions();
  const done = task.status === 'done';
  const isFocus = timer?.focus?.task.id === task.id;
  const details = [
    task.type,
    quantityText(task.quantity, task.unit),
    task.subtaskCount > 0 ? `${task.subtasksDone}/${task.subtaskCount} subtasks` : '',
  ].filter(Boolean);

  return (
    <div
      className={cn(
        'group flex items-center gap-3 px-2 py-2',
        task.running && 'bg-emerald-50/60 dark:bg-emerald-500/5',
        className,
      )}
    >
      {leading}
      <input
        type="checkbox"
        className="size-4 shrink-0 accent-indigo-600"
        aria-label={done ? `Reopen ${task.title}` : `Finish ${task.title}`}
        checked={done}
        onChange={() => (done ? void reopen(task.id) : complete(task))}
      />
      <div className="min-w-0 flex-1">
        <Link
          to={`/tasks/${task.id}`}
          className={cn(
            'block truncate text-sm hover:text-indigo-700 dark:hover:text-indigo-300',
            done && 'text-zinc-400 line-through',
            task.priority === 'high' && !done && 'font-semibold',
          )}
        >
          {task.title}
        </Link>
        <div className="flex min-w-0 items-center gap-2 text-xs text-zinc-500">
          {task.course && (
            <span className="flex shrink-0 items-center gap-1">
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: task.course.color }}
              />
              {task.course.code || task.course.name}
            </span>
          )}
          {task.dueAt && !done && (
            <span className={cn('shrink-0', dueClass[dueStatus(task.dueAt, now)])}>
              {formatTaskDue(task.dueAt, now)}
            </span>
          )}
          {details.length > 0 && <span className="truncate">{details.join(' · ')}</span>}
          {task.attention === 'background' && <span className="text-sky-600">background</span>}
        </div>
      </div>
      <span className="shrink-0 text-xs">
        <TimeVsEstimate task={task} />
      </span>
      {!done &&
        (task.running ? (
          <button
            type="button"
            aria-label={isFocus ? `Pause ${task.title}` : `Stop ${task.title}`}
            title={isFocus ? 'Pause' : 'Stop'}
            className="grid size-8 shrink-0 place-items-center rounded-full bg-emerald-600 text-white hover:bg-emerald-500"
            onClick={() => void (isFocus ? pause() : stop(task.id))}
          >
            {isFocus ? <Pause className="size-4" /> : <Square className="size-3.5" />}
          </button>
        ) : (
          <button
            type="button"
            aria-label={`Start ${task.title}`}
            title="Start the timer"
            className="grid size-8 shrink-0 place-items-center rounded-full border border-zinc-300 text-zinc-600 hover:border-emerald-500 hover:text-emerald-600 dark:border-zinc-700 dark:text-zinc-400"
            onClick={() => void start(task.id)}
          >
            <Play className="size-4" />
          </button>
        ))}
      {todayToggle && !done && (
        <button
          type="button"
          aria-label={task.todayOrder === null ? 'Add to Today' : 'Remove from Today'}
          aria-pressed={task.todayOrder !== null}
          title={task.todayOrder === null ? 'Add to Today' : 'Remove from Today'}
          className={cn(
            'grid size-8 shrink-0 place-items-center rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800',
            task.todayOrder === null
              ? 'text-zinc-300 opacity-0 group-hover:opacity-100 focus:opacity-100 dark:text-zinc-600'
              : 'text-amber-500',
          )}
          onClick={() => void setToday(task.id, task.todayOrder === null)}
        >
          <Sun className={cn('size-4', task.todayOrder !== null && 'fill-current')} />
        </button>
      )}
    </div>
  );
}
