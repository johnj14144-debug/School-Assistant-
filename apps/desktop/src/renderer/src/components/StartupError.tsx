import type { IpcOutput } from '../../../shared/ipc';
import { Button } from './Button';

type StartupFailure = Extract<IpcOutput<'app:status'>, { ok: false }>;

/** Shown instead of the app when the database can't be opened or updated. */
export function StartupError({ failure }: { failure: StartupFailure }) {
  return (
    <div className="flex h-full items-center justify-center bg-zinc-50 p-10 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <div className="max-w-xl rounded-xl border border-red-200 bg-white p-8 shadow-sm dark:border-red-900 dark:bg-zinc-900">
        <h1 className="text-xl font-semibold">School Assistant couldn't open your data</h1>
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          Your data file was not changed. Paste the details below into a Claude Code session to get
          help. To go back to a backup instead: quit, delete school-assistant.db and any
          school-assistant.db-wal and -shm files next to it, then copy the newest file from your
          backup folder into the data folder and rename it to school-assistant.db.
        </p>
        <pre className="mt-4 whitespace-pre-wrap rounded-md bg-zinc-100 p-3 text-xs leading-5 dark:bg-zinc-800">
          {failure.error}
        </pre>
        <p className="mt-3 break-all text-xs text-zinc-500">Data file: {failure.dbFile}</p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button onClick={() => void window.api.invoke('app:open-folder', { folder: 'data' })}>
            Open data folder
          </Button>
          <Button onClick={() => void window.api.invoke('app:open-folder', { folder: 'logs' })}>
            Open log folder
          </Button>
          <Button variant="danger" onClick={() => void window.api.invoke('app:quit')}>
            Quit
          </Button>
        </div>
      </div>
    </div>
  );
}
