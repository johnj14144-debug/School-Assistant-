import { formatMinutes } from '@sa/core';
import { type FormEvent, useState } from 'react';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { inputClass } from '../../components/inputs';
import { cn } from '../../lib/cn';
import type { TaskTarget } from './TaskActions';

interface CompleteDialogProps {
  task: TaskTarget | null;
  onClose: () => void;
  /** Resolves to whether it saved. */
  onSubmit: (note: string) => unknown;
}

/** "What did you do?" when finishing a task. Enter saves; Shift+Enter starts a new line. */
export function CompleteDialog({ task, onClose, onSubmit }: CompleteDialogProps) {
  const [note, setNote] = useState('');
  const [lastId, setLastId] = useState<string | null>(null);
  if ((task?.id ?? null) !== lastId) {
    setLastId(task?.id ?? null);
    setNote(task?.completionNote ?? '');
  }
  const editing = task?.status === 'done';

  async function save(e?: FormEvent) {
    e?.preventDefault();
    if ((await onSubmit(note)) !== false) onClose();
  }

  return (
    <Dialog
      open={task !== null}
      onClose={onClose}
      title={editing ? 'What you did' : `Finish “${task?.title ?? ''}”`}
    >
      {task && (
        <form onSubmit={(e) => void save(e)} className="mt-3">
          <p className="text-sm text-zinc-500">
            {task.actualMin > 0 ? `Timed ${formatMinutes(task.actualMin)}` : 'Not timed'}
            {task.estimateMin !== null && ` · estimate ${formatMinutes(task.estimateMin)}`}
          </p>
          <label className="mt-4 block text-sm font-medium" htmlFor="completion-note">
            What did you do? <span className="font-normal text-zinc-500">(optional)</span>
          </label>
          <textarea
            id="completion-note"
            autoFocus
            rows={3}
            className={cn(inputClass, 'mt-1 w-full resize-y')}
            placeholder="e.g. Problems 1–12, stuck on 9; re-read 2.3"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void save();
              }
            }}
          />
          <div className="mt-4 flex justify-end gap-2">
            <Button onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="primary">
              {editing ? 'Save' : 'Mark done'}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
