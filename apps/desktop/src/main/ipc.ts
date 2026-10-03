import { ipcMain } from 'electron';
import { type IpcChannel, type IpcOutput, type IpcParsedInput, ipcContract } from '../shared/ipc';
import type { Logger } from './log';

type Handler<C extends IpcChannel> = (
  input: IpcParsedInput<C>,
) => IpcOutput<C> | Promise<IpcOutput<C>>;

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

/** Registers every channel. Failures are logged here, then passed on to the renderer. */
export function registerIpcHandlers(handlers: IpcHandlers, log: Logger): void {
  const dispatch = createIpcDispatcher(handlers);
  for (const channel of Object.keys(ipcContract) as IpcChannel[]) {
    ipcMain.handle(channel, async (_event, raw: unknown) => {
      try {
        return await dispatch(channel, raw);
      } catch (error) {
        log.error(`IPC ${channel} failed`, error);
        throw error;
      }
    });
  }
}

/** The handlers for every channel starting with one of the given prefixes, e.g. 'backup'. */
export type HandlersFor<Prefix extends string> = Pick<
  IpcHandlers,
  Extract<IpcChannel, `${Prefix}:${string}`>
>;
