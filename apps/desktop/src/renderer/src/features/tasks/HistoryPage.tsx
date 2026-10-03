import { formatMinutes } from '@sa/core';
import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '../../components/Button';
import { inputClass } from '../../components/inputs';
import { cn } from '../../lib/cn';
import { useLiveQuery } from '../../lib/useIpc';
import { quantityText } from './format';

const PAGE = 200;

/** "1.4×", colored when far from the estimate. */
function Ratio({ estimate, actual }: { estimate: number | null; actual: number }) {
  if (!estimate || actual < 0.5) return <span className="text-zinc-400">—</span>;
  const ratio = actual / estimate;
  return (
    <span
      className={cn(
        'tabular-nums',
        ratio > 1.15 && 'text-red-600 dark:text-red-400',
        ratio < 0.85 && 'text-emerald-700 dark:text-emerald-400',
      )}
      title={ratio > 1 ? 'Took longer than estimated' : 'Took less than estimated'}
    >
      {ratio.toFixed(2)}×
    </span>
  );
}

const th = 'px-2 py-1.5 font-medium';
const td = 'px-2 py-1.5';

/** Finished work: estimate vs actual per course + type, and every finished task. */
export function HistoryPage() {
  const { data, error } = useLiveQuery('history:get');
  const [search, setSearch] = useState('');
  const [shown, setShown] = useState(PAGE);
  const needle = search.trim().toLowerCase();
  const tasks = (data?.tasks ?? []).filter(
    (t) =>
      !needle ||
      [t.title, t.type, t.course?.code ?? '', t.course?.name ?? '', t.completionNote].some((s) =>
        s.toLowerCase().includes(needle),
      ),
  );

  return (
    <div className="mx-auto max-w-5xl px-10 py-12">
      <Link
        to="/tasks"
        className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
      >
        ← Tasks
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">History</h1>
      <p className="mt-1 text-zinc-600 dark:text-zinc-400">
        How long finished work really took, against your estimates.
      </p>
      {error && <p className="mt-6 text-sm text-red-700">{error}</p>}

      <section className="mt-10">
        <h2 className="text-lg font-semibold">By course and type</h2>
        <p className="mt-1 text-sm text-zinc-500">
          “Estimated” compares finished tasks that had an estimate and timed work; a task and its
          subtasks count once, at the level you estimated.
        </p>
        {data && data.groups.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">Nothing finished yet.</p>
        ) : (
          <table className="mt-3 w-full text-sm">
            <thead className="text-left text-xs text-zinc-500">
              <tr>
                <th className={th}>Course</th>
                <th className={th}>Type</th>
                <th className={cn(th, 'text-right')}>Done</th>
                <th className={cn(th, 'text-right')}>Time spent</th>
                <th className={cn(th, 'text-right')}>Estimated</th>
                <th className={cn(th, 'text-right')}>Actual</th>
                <th className={cn(th, 'text-right')}>Actual ÷ estimate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {data?.groups.map((g) => (
                <tr key={`${g.course?.id ?? ''}|${g.type}`}>
                  <td className={td}>
                    {g.course ? (
                      <span className="flex items-center gap-1.5">
                        <span
                          className="size-2 rounded-full"
                          style={{ backgroundColor: g.course.color }}
                        />
                        {g.course.code || g.course.name}
                      </span>
                    ) : (
                      <span className="text-zinc-400">No course</span>
                    )}
                  </td>
                  <td className={td}>{g.type || <span className="text-zinc-400">No type</span>}</td>
                  <td className={cn(td, 'text-right tabular-nums')}>{g.doneCount}</td>
                  <td className={cn(td, 'text-right tabular-nums')}>{formatMinutes(g.spentMin)}</td>
                  <td className={cn(td, 'text-right tabular-nums')}>
                    {g.compared.count > 0
                      ? `${formatMinutes(g.compared.estimateMin)} (${g.compared.count})`
                      : '—'}
                  </td>
                  <td className={cn(td, 'text-right tabular-nums')}>
                    {g.compared.count > 0 ? formatMinutes(g.compared.actualMin) : '—'}
                  </td>
                  <td className={cn(td, 'text-right')}>
                    <Ratio estimate={g.compared.estimateMin} actual={g.compared.actualMin} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="mt-12">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Finished tasks</h2>
          <input
            className={cn(inputClass, 'w-56')}
            type="search"
            placeholder="Search"
            aria-label="Search finished tasks"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <table className="mt-3 w-full table-fixed text-sm">
          <thead className="text-left text-xs text-zinc-500">
            <tr>
              <th className={cn(th, 'w-28')}>Finished</th>
              <th className={th}>Task</th>
              <th className={cn(th, 'w-28')}>Course</th>
              <th className={cn(th, 'w-20 text-right')}>Estimate</th>
              <th className={cn(th, 'w-20 text-right')}>Actual</th>
              <th className={cn(th, 'w-16 text-right')}>÷</th>
              <th className={th}>What you did</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {tasks.slice(0, shown).map((t) => (
              <tr key={t.id}>
                <td className={cn(td, 'text-zinc-500')}>
                  {new Date(t.completedAt).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    weekday: 'short',
                  })}
                </td>
                <td className={td}>
                  <Link
                    to={`/tasks/${t.id}`}
                    className="block truncate hover:text-indigo-700 dark:hover:text-indigo-300"
                  >
                    {t.title}
                  </Link>
                  <span className="block truncate text-xs text-zinc-500">
                    {[
                      t.parentTitle && `in ${t.parentTitle}`,
                      t.type,
                      quantityText(t.quantity, t.unit),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </td>
                <td className={cn(td, 'truncate')}>{t.course?.code || t.course?.name || ''}</td>
                <td className={cn(td, 'text-right tabular-nums')}>
                  {t.estimateMin !== null ? formatMinutes(t.estimateMin) : '—'}
                </td>
                <td className={cn(td, 'text-right tabular-nums')}>
                  {t.actualMin >= 0.5 ? formatMinutes(t.actualMin) : '—'}
                </td>
                <td className={cn(td, 'text-right')}>
                  <Ratio estimate={t.estimateMin} actual={t.actualMin} />
                </td>
                <td
                  className={cn(td, 'truncate text-zinc-600 dark:text-zinc-400')}
                  title={t.completionNote}
                >
                  {t.completionNote}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {tasks.length > shown && (
          <Button className="mt-3" onClick={() => setShown(shown + PAGE)}>
            Show more
          </Button>
        )}
      </section>
    </div>
  );
}
