import { app } from 'electron';
import type { IpcHandlers } from './ipc';

/** Main-process implementations of every IPC channel. Grows one feature at a time. */
export function createHandlers(): IpcHandlers {
  return {
    'app:info': () => ({
      name: app.getName(),
      version: app.getVersion(),
      platform: process.platform,
      dataDir: app.getPath('userData'),
    }),
  };
}
