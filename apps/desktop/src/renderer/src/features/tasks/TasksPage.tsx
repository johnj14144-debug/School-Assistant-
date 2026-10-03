import type { TaskListItem } from '@sa/core';
import { History, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '../../components/Button';
import { inputClass } from '../../components/inputs';
import { cn } from '../../lib/cn';
import { dueStatus } from '../../lib/dates';
import { useIpcQuery, useLiveQuery } from '../../lib/useIpc';
import { useNow } from '../../lib/useNow';
import { useTaskActions } from '../timer/TaskActions';
import { TaskForm } from './TaskForm';
import { TaskRow } from './TaskRow';

const GROUPS = [
  ['overdue', 'Overdue'],
  ['today', 'Due today'],
  ['week', 'Next 7 days'],
  ['later', 'Later'],
] as const;

const DONE_PAGE = 100;

/** Every open task grouped by due date, or the finished ones; add and filter. */
export function TasksPage() {
  const now = useNow(60_000);
  const { run } = useTaskActions();
  const [status, setStatus] = useState<'open' | 'done'>('open');
  const { data: tasks, error } = useLiveQuery('task:list', { status }, status);
  const { data: courses } = useIpcQuery('course:list');
  const [adding, setAdding] = useState(false);
  const [courseFilter, setCourseFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [withSubtasks, setWithSubtasks] = useState(false);
  const [doneShown, setDoneShown] = useState(DONE_PAGE);

  const needle = search.trim().toLowerCase();
  const visible = (tasks ?? []).filter(
    (t) =>
      (withSubtasks || status === 'done' || t.parentId === null) &&
      (courseFilter === 'all' ||
        (courseFilter === 'none' ? t.courseId === null : t.courseId === courseFilter)) &&
      (!needle || t.title.toLowerCase().includes(needle) || t.type.toLowerCase().includes(needle)),
  );
  const grouped = (key: (typeof GROUPS)[number][0]) =>
    visible.filter((t) => dueStatus(t.dueAt, now) === key);

  const list = (items: TaskListItem[]) => (
    <div className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
      {items.map((t) => (
        <TaskRow key={t.id} task={t} now={now} />
      ))}
    </div>
  );

  return (
    <div className="mx-auto max-w-4xl px-10 py-12">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
          <p className="mt-1 text-zinc-600 dark:text-zinc-400">
            Everything to do, with a timer that learns how long things take you.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            to="/tasks/history"
            className="flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            <History className="size-4" aria-hidden />
            History
          </Link>
          <Button variant="primary" onClick={() => setAdding(!adding)}>
            <Plus className="-ml-1 mr-1 inline size-4" aria-hidden />
            New task
          </Button>
        </div>
      </div>
      <p className="mt-2 text-xs text-zinc-500">
        Tip: press{' '}
        <kbd className="rounded border border-zinc-300 px-1 dark:border-zinc-700">Ctrl+K</kbd>{' '}
        anywhere and type “Calc HW 3 fri 5pm ~1h #math @homework”.
      </p>

      {adding && (
        <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <TaskForm
            submitLabel="Add task"
            onCancel={() => setAdding(false)}
            onSubmit={async (values) => {
              const ok = await run(() => window.api.invoke('task:create', values));
              if (ok) setAdding(false);
              return ok;
            }}
          />
        </div>
      )}

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <div className="flex rounded-md border border-zinc-300 p-0.5 dark:border-zinc-700">
          {(['open', 'done'] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={status === s}
              className={cn(
                'rounded px-3 py-1 text-sm',
                status === s
                  ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                  : 'text-zinc-600 dark:text-zinc-400',
              )}
              onClick={() => setStatus(s)}
            >
              {s === 'open' ? 'To do' : 'Done'}
            </button>
          ))}
        </div>
        <select
          className={inputClass}
          aria-label="Course"
          value={courseFilter}
          onChange={(e) => setCourseFilter(e.target.value)}
        >
          <option value="all">All courses</option>
          {courses?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code || c.name}
            </option>
          ))}
          <option value="none">No course</option>
        </select>
        <input
          className={cn(inputClass, 'w-56')}
          type="search"
          placeholder="Search"
          aria-label="Search tasks"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {status === 'open' && (
          <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
            <input
              type="checkbox"
              checked={withSubtasks}
              onChange={(e) => setWithSubtasks(e.target.checked)}
            />
            Show subtasks
          </label>
        )}
      </div>

      {error && <p className="mt-6 text-sm text-red-700">{error}</p>}
      {tasks && visible.length === 0 && (
        <div className="mt-8 rounded-xl border border-dashed border-zinc-300 p-10 text-center dark:border-zinc-700">
          <p className="font-medium">
            {tasks.length === 0
              ? status === 'open'
                ? 'Nothing to do yet'
                : 'Nothing finished yet'
              : 'No tasks match'}
          </p>
          {status === 'open' && tasks.length === 0 && (
            <p className="mt-1 text-sm text-zinc-500">Add one with New task or Ctrl+K.</p>
          )}
        </div>
      )}

      {status === 'open'
        ? GROUPS.map(([key, label]) => {
            const items = grouped(key);
            if (items.length === 0) return null;
            return (
              <section key={key} className="mt-8">
                <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-zinc-500">
                  {label} <span className="font-normal">({items.length})</span>
                </h2>
                {list(items)}
              </section>
            );
          })
        : visible.length > 0 && (
            <section className="mt-8">
              {list(visible.slice(0, doneShown))}
              {visible.length > doneShown && (
                <Button className="mt-3" onClick={() => setDoneShown(doneShown + DONE_PAGE)}>
                  Show more
                </Button>
              )}
            </section>
          )}
    </div>
  );
}
