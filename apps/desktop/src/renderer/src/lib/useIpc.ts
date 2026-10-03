import { useCallback, useEffect, useRef, useState } from 'react';
import type { IpcChannel, IpcEvent, IpcEvents, IpcInput, IpcOutput } from '../../../shared/ipc';
import { errorMessage } from './format';

/**
 * Loads `channel` on mount and whenever `key` changes; `reload()` fetches again and resolves
 * once the new data is in state.
 */
export function useIpcQuery<C extends IpcChannel>(channel: C, input?: IpcInput<C>, key = '') {
  const [data, setData] = useState<IpcOutput<C> | null>(null);
  const [error, setError] = useState<string | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` stands in for `input`.
  const reload = useCallback(
    () =>
      window.api
        .invoke(channel, input)
        .then((result) => {
          setData(result);
          setError(null);
        })
        .catch((e: unknown) => setError(errorMessage(e))),
    [channel, key],
  );

  useEffect(() => {
    void reload();
  }, [reload]);
  return { data, error, reload };
}

/** Calls `listener` whenever the main process sends `event`. */
export function useIpcEvent<E extends IpcEvent>(
  event: E,
  listener: (payload: IpcEvents[E]) => void,
) {
  const latest = useRef(listener);
  latest.current = listener;
  useEffect(() => window.api.on(event, (payload) => latest.current(payload)), [event]);
}

/**
 * `useIpcQuery` that also reloads whenever tasks, the timer or the calendar change anywhere
 * (another page, the tray, a dialog).
 */
export function useLiveQuery<C extends IpcChannel>(channel: C, input?: IpcInput<C>, key = '') {
  const query = useIpcQuery(channel, input, key);
  useIpcEvent('tasks:changed', () => void query.reload());
  useIpcEvent('calendar:changed', () => void query.reload());
  return query;
}
