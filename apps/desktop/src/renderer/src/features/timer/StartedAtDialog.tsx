import type { TimerState } from '@sa/core';
import { type FormEvent, useState } from 'react';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { inputClass } from '../../components/inputs';
import { formatTime, pastTimeToIso, toTimeInput } from '../../lib/dates';
import type { TaskTarget } from './TaskActions';

interface StartedAtDialogProps {
  task: TaskTarget | null;
  timer: TimerState | null;
  onClose: () => void;
  /** Resolves to whether the timer started. */
  onSubmit: (startAt: string) => unknown;
}

const MINUTES_AGO = [5, 10, 15, 30, 45, 60];

/** "I started at…": start the timer (or fix a running timer's start) at an earlier time. */
export function StartedAtDialog({ task, timer, onClose, onSubmit }: StartedAtDialogProps) {
  const [time, setTime] = useState('');
  const [lastId, setLastId] = useState<string | null>(null);
  if ((task?.id ?? null) !== lastId) {
    setLastId(task?.id ?? null);
    setTime(toTimeInput(new Date(Date.now() - 15 * 60_000).toISOString()));
  }
  const running = task && timer?.focus?.task.id === task.id ? timer.focus : null;
  const runningBackground = timer?.background.find((b) => b.task.id === task?.id);
  const since = running?.session?.startAt ?? runningBackground?.session?.startAt;
  const other =
    task && task.attention !== 'background' && timer?.focus && timer.focus.task.id !== task.id
      ? timer.focus.task.title
      : null;

  async function start(startAt: string | null) {
    if (!startAt) return;
    if ((await onSubmit(startAt)) !== false) onClose();
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    void start(pastTimeToIso(time));
  }

  return (
    <Dialog open={task !== null} onClose={onClose} title={`When did you start “${task?.title}”?`}>
      {since && (
        <p className="mt-2 text-sm text-zinc-500">
          The timer says {formatTime(since)}. Pick the real start.
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {MINUTES_AGO.map((minutes) => (
          <Button
            key={minutes}
            onClick={() => void start(new Date(Date.now() - minutes * 60_000).toISOString())}
          >
            {minutes === 60 ? '1 h ago' : `${minutes} min ago`}
          </Button>
        ))}
      </div>
      <form onSubmit={submit} className="mt-4 flex items-center gap-2">
        <label className="text-sm" htmlFor="started-at">
          or at
        </label>
        <input
          id="started-at"
          type="time"
          className={inputClass}
          value={time}
          onChange={(e) => setTime(e.target.value)}
        />
        <Button type="submit" variant="primary" disabled={!pastTimeToIso(time)}>
          {since ? 'Set start' : 'Start'}
        </Button>
      </form>
      {other && <p className="mt-3 text-sm text-zinc-500">{other} stops at the time you pick.</p>}
      <div className="mt-5 flex justify-end">
        <Button onClick={onClose}>Cancel</Button>
      </div>
    </Dialog>
  );
}
