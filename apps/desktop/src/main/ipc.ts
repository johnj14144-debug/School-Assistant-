import { ipcMain } from 'electron';
import { type IpcChannel, type IpcInput, type IpcOutput, ipcContract } from '../shared/ipc';

type Handler<C extends IpcChannel> = (input: IpcInput<C>) => IpcOutput<C> | Promise<IpcOutput<C>>;

/** One handler per contract channel; the type makes a missing handler a compile error. */
export type IpcHandlers = { [C in IpcChannel]: Handler<C> };

/**
 * Wraps handlers so every call is validated against the contract on the way in and out.
 * Kept free of Electron so it can be unit-tested.
 */
export function createIpcDispatcher(handlers: IpcHandlers) {
  return async (channel: IpcChannel, raw: unknown): Promise<unknown> => {
    const schema = ipcContract[channel];
    if (!schema) throw new Error(`Unknown IPC channel: ${String(channel)}`);
    const input = schema.input.parse(raw);
    const output = await handlers[channel](input as never);
    return schema.output.parse(output);
  };
}

export function registerIpcHandlers(handlers: IpcHandlers): void {
  const dispatch = createIpcDispatcher(handlers);
  for (const channel of Object.keys(ipcContract) as IpcChannel[]) {
    ipcMain.handle(channel, (_event, raw: unknown) => dispatch(channel, raw));
  }
}
