import { type BlockView, formatMinutes, type OccurrenceView, type TaskListItem } from '@sa/core';
import { AlertTriangle, Lock, LockOpen, Play, Trash2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { inputClass } from '../../components/inputs';
import { formatTime } from '../../lib/dates';
import { useTaskActions } from '../timer/TaskActions';
import { KIND_LABELS } from './routine';
import { useDialogAction } from './useDialogAction';

export interface Span {
  startAt: string;
  endAt: string;
}

/** "Wed, Oct 7 · 11:00 AM – 12:00 PM (1h)" in the laptop's zone. */
export function spanText({ startAt, endAt }: Span): string {
  const day = new Date(startAt).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const minutes = (Date.parse(endAt) - Date.parse(startAt)) / 60_000;
  return `${day} · ${formatTime(startAt)} – ${formatTime(endAt)} (${formatMinutes(minutes)})`;
}

function ErrorLine({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-400">
      {error}
    </p>
  );
}

const taskLabel = (t: TaskListItem) =>
  `${t.course ? `${t.course.code || t.course.name}: ` : ''}${t.title}`;

interface NewBlockProps {
  span: Span | null;
  todayTasks: TaskListItem[];
  otherTasks: TaskListItem[];
  onClose: () => void;
}

/** Plan a stretch of time picked on the calendar: for a task, or with a title of its own. */
export function NewBlockDialog(props: NewBlockProps) {
  const { span, onClose } = props;
  return (
    <Dialog open={span !== null} onClose={onClose} title="Plan this time">
      {span && <NewBlockForm key={`${span.startAt}|${span.endAt}`} {...props} span={span} />}
    </Dialog>
  );
}

function NewBlockForm({ span, todayTasks, otherTasks, onClose }: NewBlockProps & { span: Span }) {
  const { error, busy, act } = useDialogAction();
  const [taskId, setTaskId] = useState(todayTasks[0]?.id ?? '');
  const [title, setTitle] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    const ok = await act(() =>
      window.api.invoke('block:create', { taskId: taskId || null, title, ...span }),
    );
    if (ok) onClose();
  }

  return (
    <>
      <p className="mt-1 text-sm text-zinc-500">{spanText(span)}</p>
      <form onSubmit={(e) => void submit(e)} className="mt-4 grid gap-3">
        <label className="grid gap-1 text-sm">
          <span className="text-zinc-600 dark:text-zinc-400">Task</span>
          <select className={inputClass} value={taskId} onChange={(e) => setTaskId(e.target.value)}>
            <option value="">No task (just a title)</option>
            {todayTasks.length > 0 && (
              <optgroup label="Today’s list">
                {todayTasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {taskLabel(t)}
                  </option>
                ))}
              </optgroup>
            )}
            {otherTasks.length > 0 && (
              <optgroup label="Other open tasks">
                {otherTasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {taskLabel(t)}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-zinc-600 dark:text-zinc-400">
            Title {taskId ? '(optional)' : ''}
          </span>
          <input
            className={inputClass}
            value={title}
            placeholder={taskId ? 'The task’s title' : 'e.g. Review lecture notes'}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <ErrorLine error={error} />
        <div className="mt-2 flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={busy}>
            Add block
          </Button>
        </div>
      </form>
    </>
  );
}

/** A planned block: start its task, rename, lock against re-planning, or delete. */
export function BlockDialog({ block, onClose }: { block: BlockView | null; onClose: () => void }) {
  return (
    <Dialog open={block !== null} onClose={onClose} title={block?.label ?? ''}>
      {block && <BlockDetails key={block.id} block={block} onClose={onClose} />}
    </Dialog>
  );
}

function BlockDetails({ block, onClose }: { block: BlockView; onClose: () => void }) {
  const { start } = useTaskActions();
  const { error, busy, act } = useDialogAction();
  const [title, setTitle] = useState(block.title);
  const { task } = block;
  const canStart = task !== null && task.status === 'open' && !task.running;

  async function rename(e: FormEvent) {
    e.preventDefault();
    await act(() => window.api.invoke('block:update', { id: block.id, title }));
  }

  return (
    <>
      <p className="mt-1 text-sm text-zinc-500">{spanText(block)}</p>
      {task && (
        <p className="mt-2 text-sm">
          For{' '}
          <Link
            to={`/tasks/${task.id}`}
            className="font-medium text-indigo-700 hover:underline dark:text-indigo-300"
          >
            {task.title}
          </Link>
          {task.course && ` · ${task.course.code || task.course.name}`}
          {task.status === 'done' && ' · done'}
          {task.running && ' · running now'}
        </p>
      )}
      {block.conflict && (
        <p className="mt-3 flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          Overlaps {block.conflict}. Move it or change the routine.
        </p>
      )}
      <form onSubmit={(e) => void rename(e)} className="mt-4 flex items-end gap-2">
        <label className="grid flex-1 gap-1 text-sm">
          <span className="text-zinc-600 dark:text-zinc-400">Title</span>
          <input
            className={inputClass}
            value={title}
            placeholder={task?.title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <Button type="submit" disabled={busy || title === block.title}>
          Rename
        </Button>
      </form>
      <ErrorLine error={error} />
      <div className="mt-5 flex flex-wrap items-center gap-2">
        {canStart && (
          <Button
            variant="primary"
            className="flex items-center gap-1.5"
            onClick={() => {
              onClose();
              void start(task.id);
            }}
          >
            <Play className="size-4" /> Start {task.title}
          </Button>
        )}
        <Button
          className="flex items-center gap-1.5"
          disabled={busy}
          onClick={() =>
            void act(() =>
              window.api.invoke('block:update', { id: block.id, locked: !block.locked }),
            )
          }
          title="A locked block stays put when the planner re-plans the day"
        >
          {block.locked ? <LockOpen className="size-4" /> : <Lock className="size-4" />}
          {block.locked ? 'Unlock' : 'Lock'}
        </Button>
        <Button
          variant="danger"
          className="flex items-center gap-1.5"
          disabled={busy}
          onClick={async () => {
            if (await act(() => window.api.invoke('block:delete', { id: block.id }))) onClose();
          }}
        >
          <Trash2 className="size-4" /> Delete
        </Button>
        <Button className="ml-auto" onClick={onClose}>
          Close
        </Button>
      </div>
    </>
  );
}

/** One occurrence of a fixed event: skip it this once, or edit the routine. */
export function OccurrenceDialog({
  occurrence,
  onClose,
}: {
  occurrence: OccurrenceView | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={occurrence !== null} onClose={onClose} title={occurrence?.title ?? ''}>
      {occurrence && (
        <OccurrenceDetails
          key={`${occurrence.eventId}|${occurrence.date}`}
          occurrence={occurrence}
          onClose={onClose}
        />
      )}
    </Dialog>
  );
}

function OccurrenceDetails({
  occurrence,
  onClose,
}: {
  occurrence: OccurrenceView;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const { error, busy, act } = useDialogAction();

  return (
    <>
      <p className="mt-1 text-sm text-zinc-500">
        {KIND_LABELS[occurrence.kind]} · {spanText(occurrence)}
        {occurrence.location && ` · ${occurrence.location}`}
      </p>
      {occurrence.extendedMin > 0 && (
        <p className="mt-3 rounded-md bg-indigo-50 px-3 py-2 text-sm text-indigo-800 dark:bg-indigo-500/10 dark:text-indigo-300">
          Extended by {formatMinutes(occurrence.extendedMin)} so you still get your full sleep on
          the night the clocks spring forward.
        </p>
      )}
      <ErrorLine error={error} />
      <div className="mt-5 flex flex-wrap items-center gap-2">
        {occurrence.kind !== 'sleep' && (
          <Button
            disabled={busy}
            onClick={async () => {
              const ok = await act(() =>
                window.api.invoke('fixed-event:skip', {
                  id: occurrence.eventId,
                  date: occurrence.date,
                  skip: true,
                }),
              );
              if (ok) onClose();
            }}
          >
            Skip this day
          </Button>
        )}
        <Button onClick={() => navigate(`/calendar/routine?edit=${occurrence.eventId}`)}>
          Edit in routine
        </Button>
        <Button className="ml-auto" onClick={onClose}>
          Close
        </Button>
      </div>
    </>
  );
}
