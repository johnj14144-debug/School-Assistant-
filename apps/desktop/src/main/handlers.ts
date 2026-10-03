import { ipcContract } from '../shared/ipc';
import { appHandlers } from './features/app/handlers';
import { backupHandlers } from './features/backup/handlers';
import { gradesHandlers } from './features/grades/handlers';
import type { IpcHandlers } from './ipc';
import type { AppPaths, Runtime } from './runtime';

/**
 * Main-process implementations of every IPC channel, composed from each feature's handler
 * object. When the database failed to open, only the `app:*` channels work (the renderer shows
 * the error screen) and everything else rejects.
 */
export function createHandlers(paths: AppPaths, runtime: Runtime): IpcHandlers {
  const app = appHandlers(paths, runtime);
  if (!runtime.ok) return { ...unavailable(), ...app };
  const { services } = runtime;
  return { ...app, ...backupHandlers(services.backup), ...gradesHandlers(services.grades) };
}

function unavailable(): IpcHandlers {
  const fail = () => {
    throw new Error('The database is not available. Restart the app after fixing the error.');
  };
  const entries = Object.keys(ipcContract).map((channel) => [channel, fail]);
  return Object.fromEntries(entries) as unknown as IpcHandlers;
}
