import { formatMinutes, sessionMinutes, type TimeSession } from '@sa/core';
import { type FormEvent, useId, useState } from 'react';
import { Button } from '../../components/Button';
import { DateTimeCell } from '../../components/DateTimeCell';
import { inputClass } from '../../components/inputs';
import { cn } from '../../lib/cn';
import { fromDateTimeInput } from '../../lib/dates';
import type { TaskActions } from '../timer/TaskActions';

interface SessionTableProps {
  taskId: string;
  sessions: TimeSession[];
  now: Date;
  run: TaskActions['run'];
}

const SOURCE = { desktop: 'timer', phone: 'phone', manual: 'typed in' };

/**
 * A task's timer sessions, newest first. Start and end edit in place; giving a running session
 * an end stops it then. The last row adds time worked without the timer.
 */
export function SessionTable({ taskId, sessions, now, run }: SessionTableProps) {
  const formId = useId();
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');

  async function add(e: FormEvent) {
    e.preventDefault();
    const startAt = fromDateTimeInput(start);
    const endAt = fromDateTimeInput(end);
    if (!startAt || !endAt) return;
    const ok = await run(() => window.api.invoke('session:create', { taskId, startAt, endAt }));
    if (ok) {
      setStart('');
      setEnd('');
    }
  }

  return (
    <>
      <table className="mt-3 w-full table-fixed text-sm">
        <thead className="text-left text-xs text-zinc-500">
          <tr>
            <th className="px-1.5 py-1 font-medium">Start</th>
            <th className="px-1.5 py-1 font-medium">End</th>
            <th className="w-24 px-1.5 py-1 font-medium">Time</th>
            <th className="w-24 px-1.5 py-1 font-medium">From</th>
            <th className="w-10" />
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {sessions.length === 0 && (
            <tr>
              <td colSpan={5} className="px-1.5 py-3 text-zinc-500">
                No time recorded yet. Start the timer, or add time you already worked below.
              </td>
            </tr>
          )}
          {sessions.map((s) => (
            <tr
              key={s.id}
              className={cn(s.endAt === null && 'bg-emerald-50/60 dark:bg-emerald-500/5')}
            >
              <td className="py-0.5">
                <DateTimeCell
                  aria-label="Session start"
                  value={s.startAt}
                  onCommit={(startAt) =>
                    run(() => window.api.invoke('session:update', { id: s.id, startAt }))
                  }
                />
              </td>
              <td className="py-0.5">
                <DateTimeCell
                  aria-label={s.endAt === null ? 'Stop at' : 'Session end'}
                  value={s.endAt}
                  onCommit={(endAt) =>
                    run(() => window.api.invoke('session:update', { id: s.id, endAt }))
                  }
                />
              </td>
              <td className="px-1.5 py-0.5 tabular-nums">
                {formatMinutes(sessionMinutes(s, now))}
                {s.endAt === null && <span className="ml-1 text-xs text-emerald-600">running</span>}
              </td>
              <td className="px-1.5 py-0.5 text-zinc-500">{SOURCE[s.source]}</td>
              <td className="py-0.5 text-right">
                <button
                  type="button"
                  aria-label="Delete session"
                  className="rounded px-2 py-1 text-zinc-400 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950"
                  onClick={() => {
                    if (window.confirm('Delete this session?')) {
                      void run(() => window.api.invoke('session:delete', { id: s.id }));
                    }
                  }}
                >
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-zinc-200 dark:border-zinc-800">
            <td className="pt-2 pr-1.5">
              <input
                type="datetime-local"
                form={formId}
                aria-label="New session start"
                className={cn(inputClass, 'w-full')}
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </td>
            <td className="pt-2 pr-1.5">
              <input
                type="datetime-local"
                form={formId}
                aria-label="New session end"
                className={cn(inputClass, 'w-full')}
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </td>
            <td className="pt-2" colSpan={3}>
              <Button type="submit" form={formId} disabled={!start || !end}>
                Add time
              </Button>
            </td>
          </tr>
        </tfoot>
      </table>
      <form id={formId} onSubmit={(e) => void add(e)} />
    </>
  );
}
