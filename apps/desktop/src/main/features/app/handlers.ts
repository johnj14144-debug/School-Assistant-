import { mkdirSync } from 'node:fs';
import { app, shell } from 'electron';
import type { HandlersFor } from '../../ipc';
import type { AppPaths, Runtime } from '../../runtime';

/** Opens a folder in Explorer, creating it first if needed. */
export async function openFolder(path: string): Promise<void> {
  mkdirSync(path, { recursive: true });
  const error = await shell.openPath(path);
  if (error) throw new Error(error);
}

export function appHandlers(paths: AppPaths, runtime: Runtime): HandlersFor<'app'> {
  return {
    'app:info': () => ({
      name: app.getName(),
      version: app.getVersion(),
      platform: process.platform,
      dataDir: paths.dataDir,
      logDir: paths.logDir,
    }),
    'app:status': () =>
      runtime.ok ? { ok: true } : { ok: false, error: runtime.error, dbFile: paths.dbFile },
    'app:open-folder': ({ folder }) => openFolder(folder === 'data' ? paths.dataDir : paths.logDir),
    'app:quit': () => app.quit(),
  };
}
