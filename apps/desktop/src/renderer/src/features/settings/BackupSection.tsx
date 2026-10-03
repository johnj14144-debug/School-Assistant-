import { useCallback, useEffect, useState } from 'react';
import type { BackupStatus, IpcChannel } from '../../../../shared/ipc';
import { Button } from '../../components/Button';
import { errorMessage, formatDateTime } from '../../lib/format';

type BackupAction = Extract<
  IpcChannel,
  'backup:run' | 'backup:choose-folder' | 'backup:use-default-folder'
>;

/** Daily backup folder, last backup, "Back up now". */
export function BackupSection() {
  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    void window.api.invoke('backup:status').then(setStatus);
  }, []);

  useEffect(() => refresh(), [refresh]);

  async function run(action: BackupAction) {
    setBusy(true);
    setError(null);
    try {
      const next = await window.api.invoke(action);
      if (next) setStatus(next);
    } catch (e) {
      setError(errorMessage(e));
      refresh();
    } finally {
      setBusy(false);
    }
  }

  const failedLast =
    status?.lastError && (!status.lastSuccessAt || status.lastError.at > status.lastSuccessAt);

  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold">Backups</h2>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        A copy of your data is saved once a day. The newest 14 days and the first backup of every
        month are kept. Pick a OneDrive folder to keep copies off the laptop.
      </p>
      <dl className="mt-4 grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
        <dt className="text-zinc-500">Folder</dt>
        <dd className="break-all font-mono text-xs leading-5">
          {status?.folder ?? '…'}
          {status?.isDefaultFolder && (
            <span className="ml-2 font-sans text-zinc-500">(default)</span>
          )}
        </dd>
        <dt className="text-zinc-500">Last backup</dt>
        <dd>{status ? formatDateTime(status.lastSuccessAt) : '…'}</dd>
        <dt className="text-zinc-500">Backups kept</dt>
        <dd>{status?.fileCount ?? '…'}</dd>
      </dl>
      {failedLast && status?.lastError && (
        <p className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-300">
          The last backup failed ({formatDateTime(status.lastError.at)}): {status.lastError.message}
        </p>
      )}
      {error && (
        <p className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="primary" disabled={busy} onClick={() => void run('backup:run')}>
          Back up now
        </Button>
        <Button disabled={busy} onClick={() => void run('backup:choose-folder')}>
          Change folder…
        </Button>
        {status && !status.isDefaultFolder && (
          <Button disabled={busy} onClick={() => void run('backup:use-default-folder')}>
            Use default folder
          </Button>
        )}
        <Button disabled={busy} onClick={() => void window.api.invoke('backup:open-folder')}>
          Open folder
        </Button>
      </div>
    </section>
  );
}
