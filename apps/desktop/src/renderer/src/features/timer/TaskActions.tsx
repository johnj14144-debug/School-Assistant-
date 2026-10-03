import type { TaskListItem, TimerState } from '@sa/core';
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react';
import { ErrorToast } from '../../components/ErrorToast';
import { errorMessage } from '../../lib/format';
import { useLiveQuery } from '../../lib/useIpc';
import { CompleteDialog } from './CompleteDialog';
import { StartedAtDialog } from './StartedAtDialog';

export type TaskTarget = Pick<
  TaskListItem,
  'id' | 'title' | 'attention' | 'estimateMin' | 'actualMin' | 'status' | 'completionNote'
>;

export interface TaskActions {
  /** Live timer state (null until loaded). */
  timer: TimerState | null;
  /** Runs an IPC change; a failure shows in the error toast. Resolves to whether it worked. */
  run: (change: () => Promise<unknown>) => Promise<boolean>;
  start: (taskId: string, startAt?: string) => Promise<boolean>;
  pause: () => Promise<boolean>;
  resume: () => Promise<boolean>;
  stop: (taskId?: string) => Promise<boolean>;
  /** Opens the finish dialog (asks what was done). */
  complete: (task: TaskTarget) => void;
  reopen: (taskId: string) => Promise<boolean>;
  /** Opens the "I started at…" dialog. */
  startEarlier: (task: TaskTarget) => void;
  setToday: (taskId: string, today: boolean) => Promise<boolean>;
}

const Context = createContext<TaskActions | null>(null);

export function useTaskActions(): TaskActions {
  const actions = useContext(Context);
  if (!actions) throw new Error('useTaskActions needs a TaskActionsProvider');
  return actions;
}

/**
 * Timer and task actions shared by every page, the timer bar and the command palette, with
 * one place for their dialogs and errors. Pages refresh through the `tasks:changed` event.
 */
export function TaskActionsProvider({ children }: { children: ReactNode }) {
  const { data: timer } = useLiveQuery('timer:state');
  const [error, setError] = useState<string | null>(null);
  const [completing, setCompleting] = useState<TaskTarget | null>(null);
  const [startingEarlier, setStartingEarlier] = useState<TaskTarget | null>(null);

  const run = useCallback(async (change: () => Promise<unknown>) => {
    try {
      await change();
      setError(null);
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    }
  }, []);

  const actions = useMemo<TaskActions>(
    () => ({
      timer,
      run,
      start: (taskId, startAt) => run(() => window.api.invoke('timer:start', { taskId, startAt })),
      pause: () => run(() => window.api.invoke('timer:pause')),
      resume: () => run(() => window.api.invoke('timer:resume')),
      stop: (taskId) => run(() => window.api.invoke('timer:stop', { taskId })),
      complete: setCompleting,
      reopen: (id) => run(() => window.api.invoke('task:reopen', { id })),
      startEarlier: setStartingEarlier,
      setToday: (id, today) => run(() => window.api.invoke('today:set', { id, today })),
    }),
    [timer, run],
  );

  return (
    <Context.Provider value={actions}>
      {children}
      <CompleteDialog
        task={completing}
        onClose={() => setCompleting(null)}
        onSubmit={(note) =>
          completing && run(() => window.api.invoke('task:complete', { id: completing.id, note }))
        }
      />
      <StartedAtDialog
        task={startingEarlier}
        timer={timer}
        onClose={() => setStartingEarlier(null)}
        onSubmit={(startAt) => startingEarlier && actions.start(startingEarlier.id, startAt)}
      />
      <ErrorToast message={error} onDismiss={() => setError(null)} />
    </Context.Provider>
  );
}
