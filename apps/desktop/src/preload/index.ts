import { contextBridge, ipcRenderer } from 'electron';
import type { RendererApi } from '../shared/ipc';

const api: RendererApi = {
  invoke: (channel, input) => ipcRenderer.invoke(channel, input),
};

contextBridge.exposeInMainWorld('api', api);
