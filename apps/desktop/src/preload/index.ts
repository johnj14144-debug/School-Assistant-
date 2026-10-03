import { contextBridge, ipcRenderer } from 'electron';
import type { IpcEvent, RendererApi } from '../shared/ipc';

/** Event names the renderer may listen to (a sandboxed preload can't import shared/ipc.ts). */
const events: readonly IpcEvent[] = ['tasks:changed'];

const api: RendererApi = {
  invoke: (channel, input) => ipcRenderer.invoke(channel, input),
  on: (event, listener) => {
    if (!events.includes(event)) throw new Error(`Unknown event: ${event}`);
    const forward = (_e: Electron.IpcRendererEvent, payload: unknown) =>
      listener(payload as Parameters<typeof listener>[0]);
    ipcRenderer.on(event, forward);
    return () => {
      ipcRenderer.removeListener(event, forward);
    };
  },
};

contextBridge.exposeInMainWorld('api', api);
