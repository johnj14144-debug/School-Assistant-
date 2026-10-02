import { z } from 'zod';

/**
 * Every call the renderer can make into the main process, with zod schemas for both directions.
 * To add one: declare it here, then add its handler in src/main/handlers.ts. The preload bridge
 * and `window.api.invoke` pick it up with full types.
 */
export const ipcContract = {
  'app:info': {
    input: z.void(),
    output: z.object({
      name: z.string(),
      version: z.string(),
      platform: z.string(),
      dataDir: z.string(),
    }),
  },
} as const;

export type IpcContract = typeof ipcContract;
export type IpcChannel = keyof IpcContract;
export type IpcInput<C extends IpcChannel> = z.input<IpcContract[C]['input']>;
export type IpcOutput<C extends IpcChannel> = z.output<IpcContract[C]['output']>;

/** Shape of `window.api`, exposed by the preload script. */
export interface RendererApi {
  invoke<C extends IpcChannel>(channel: C, input?: IpcInput<C>): Promise<IpcOutput<C>>;
}
