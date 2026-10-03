import { formatMinutes } from '@sa/core';
import { Check, Clock, Pause, Play, RotateCcw, Sun } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Button } from '../../components/Button';
import { cn } from '../../lib/cn';
import { formatTaskDue } from '../../lib/dates';
import { formatDateTime } from '../../lib/format';
import { useLiveQuery } from '../../lib/useIpc';
import { useNow } from '../../lib/useNow';
import { useTaskActions } from '../timer/TaskActions';
import { quantityText, singularUnit } from './format';
import { QuickAddInput } from './QuickAddInput';
import { SessionTable } from './SessionTable';
import { TaskForm } from './TaskForm';
import { TaskRow } from './TaskRow';

/** One task: details, timer controls, subtasks, completion note and timer sessions. */
export function TaskPage() {
  const { taskId = '' } = useParams();
  const navigate = useNavigate();
  const now = useNow(15_000);
  const actions = useTaskActions();
  const { data, error } = useLiveQuery('task:get', { id: taskId }, taskId);
  const [editing, setEditing] = useState(false);

  if (error) {
    return (
      <div className="mx-auto max-w-4xl px-10 py-12">
        <Link to="/tasks" className="text-sm text-zinc-500 hover:text-zinc-800">
          ← Tasks
        </Link>
        <p className="mt-4 text-sm text-red-700">{error}</p>
      </div>
    );
  }
  if (!data) return null;
  const { task, ancestors, assignment, subtasks, sessions, ownMin } = data;
  const done = task.status === 'done';
  const isFocus = actions.timer?.focus?.task.id === task.id;
  const perUnit =
    task.quantity && task.actualMin >= 1 && done
      ? `${formatMinutes(task.actualMin / task.quantity)} per ${singularUnit(task.unit) || 'unit'}`
      : null;

  async function remove() {
    const extra = task.subtaskCount > 0 ? ` and its ${task.subtaskCount} subtasks` : '';
    if (!window.confirm(`Delete "${task.title}"${extra}, with all recorded time?`)) return;
    const ok = await actions.run(() => window.api.invoke('task:delete', { id: task.id }));
    if (ok) navigate(task.parentId ? `/tasks/${task.parentId}` : '/tasks');
  }

  const meta = [
    assignment && `for ${assignment.title}`,
    task.dueAt && `due ${formatTaskDue(task.dueAt, now)}`,
    task.type,
    quantityText(task.quantity, task.unit),
    task.priority !== 'normal' && `${task.priority} priority`,
    task.attention !== 'focus' && task.attention,
    task.steps.length > 0 && `${task.steps.length} steps`,
    !task.splittable && 'one sitting',
    task.earliestStartAt && `not before ${formatTaskDue(task.earliestStartAt, now)}`,
    task.allowLate && 'may run late',
  ].filter(Boolean);

  return (
    <div className="mx-auto max-w-4xl px-10 py-12">
      <nav className="flex flex-wrap items-center gap-1 text-sm text-zinc-500">
        <Link to="/tasks" className="hover:text-zinc-800 dark:hover:text-zinc-200">
          ← Tasks
        </Link>
        {ancestors.map((a) => (
          <span key={a.id} className="flex items-center gap-1">
            <span>/</span>
            <Link to={`/tasks/${a.id}`} className="hover:text-zinc-800 dark:hover:text-zinc-200">
              {a.title}
            </Link>
          </span>
        ))}
      </nav>

      <div className="mt-2 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1
            className={cn(
              'text-2xl font-semibold tracking-tight',
              done && 'text-zinc-400 line-through',
            )}
          >
            {task.title}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-zinc-500">
            {task.course && (
              <Link
                to={`/grades/${task.course.id}`}
                className="flex items-center gap-1.5 hover:text-zinc-800 dark:hover:text-zinc-200"
              >
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: task.course.color }}
                />
                {task.course.code || task.course.name}
              </Link>
            )}
            {meta.length > 0 && (
              <span>
                {task.course && '· '}
                {meta.join(' · ')}
              </span>
            )}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          <Button onClick={() => setEditing(!editing)}>{editing ? 'Close' : 'Edit'}</Button>
          <Button variant="danger" onClick={() => void remove()}>
            Delete
          </Button>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        {!done &&
          (task.running ? (
            <Button
              variant="primary"
              className="bg-emerald-600 hover:bg-emerald-500"
              onClick={() => void (isFocus ? actions.pause() : actions.stop(task.id))}
            >
              <Pause className="-ml-1 mr-1 inline size-4" aria-hidden />
              {isFocus ? 'Pause' : 'Stop'}
            </Button>
          ) : (
            <Button variant="primary" onClick={() => void actions.start(task.id)}>
              <Play className="-ml-1 mr-1 inline size-4" aria-hidden />
              Start
            </Button>
          ))}
        {!done && (
          <Button onClick={() => actions.startEarlier(task)}>
            <Clock className="-ml-1 mr-1 inline size-4" aria-hidden />
            {task.running ? 'Fix start time' : 'I started at…'}
          </Button>
        )}
        {done ? (
          <Button onClick={() => void actions.reopen(task.id)}>
            <RotateCcw className="-ml-1 mr-1 inline size-4" aria-hidden />
            Reopen
          </Button>
        ) : (
          <Button onClick={() => actions.complete(task)}>
            <Check className="-ml-1 mr-1 inline size-4" aria-hidden />
            Done
          </Button>
        )}
        {!done && (
          <Button
            aria-pressed={task.todayOrder !== null}
            onClick={() => void actions.setToday(task.id, task.todayOrder === null)}
          >
            <Sun
              className={cn(
                '-ml-1 mr-1 inline size-4',
                task.todayOrder !== null && 'fill-amber-400 text-amber-500',
              )}
              aria-hidden
            />
            {task.todayOrder === null ? 'Add to Today' : 'On Today'}
          </Button>
        )}
      </div>

      {editing && (
        <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <TaskForm
            task={task}
            submitLabel="Save"
            onCancel={() => setEditing(false)}
            onSubmit={async ({ today: _today, ...values }) => {
              const ok = await actions.run(() =>
                window.api.invoke('task:update', { id: task.id, ...values }),
              );
              if (ok) setEditing(false);
              return ok;
            }}
          />
        </div>
      )}

      <dl className="mt-8 grid grid-cols-4 gap-4">
        {(
          [
            ['Time spent', task.actualMin >= 0.5 ? formatMinutes(task.actualMin) : '—'],
            ['Estimate', task.estimateMin !== null ? formatMinutes(task.estimateMin) : '—'],
            subtasks.length > 0
              ? ['On this task itself', formatMinutes(ownMin)]
              : ['Pace', perUnit ?? '—'],
            ['Finished', done ? formatDateTime(task.completedAt) : 'Not yet'],
          ] as const
        ).map(([label, value]) => (
          <div
            key={label}
            className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <dt className="text-xs text-zinc-500">{label}</dt>
            <dd
              className={cn(
                'mt-1 text-lg font-semibold tabular-nums',
                label === 'Time spent' &&
                  task.estimateMin !== null &&
                  task.actualMin > task.estimateMin &&
                  'text-red-600 dark:text-red-400',
              )}
            >
              {value}
            </dd>
          </div>
        ))}
      </dl>

      {task.description && (
        <p className="mt-6 whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">
          {task.description}
        </p>
      )}

      {done && (
        <section className="mt-8 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-900 dark:bg-emerald-500/5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">What you did</h2>
            <button
              type="button"
              className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
              onClick={() => actions.complete(task)}
            >
              Edit
            </button>
          </div>
          <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">
            {task.completionNote || 'No note.'}
          </p>
        </section>
      )}

      <section className="mt-10">
        <h2 className="text-lg font-semibold">
          Subtasks
          {subtasks.length > 0 && (
            <span className="ml-2 text-sm font-normal text-zinc-500">
              {task.subtasksDone} of {task.subtaskCount} done
            </span>
          )}
        </h2>
        {subtasks.length > 0 && (
          <div className="mt-3 divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
            {subtasks.map((t) => (
              <TaskRow key={t.id} task={t} now={now} />
            ))}
          </div>
        )}
        <QuickAddInput
          className="mt-3"
          aria-label="New subtask"
          placeholder="Add a subtask, e.g. “Problems 1-12 ~45m”"
          extra={{ parentId: task.id }}
        />
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Time</h2>
        <SessionTable taskId={task.id} sessions={sessions} now={now} run={actions.run} />
      </section>
    </div>
  );
}
