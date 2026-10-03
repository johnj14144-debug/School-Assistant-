import { useCallback, useEffect, useState } from 'react';
import type { IpcChannel, IpcInput, IpcOutput } from '../../../shared/ipc';
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
