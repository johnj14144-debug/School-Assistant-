import {
  assignmentCreateSchema,
  assignmentSchema,
  assignmentUpdateSchema,
  categoryCreateSchema,
  categoryUpdateSchema,
  courseCreateSchema,
  courseDetailSchema,
  courseSchema,
  courseSummarySchema,
  courseUpdateSchema,
  gradeCategorySchema,
  idSchema,
} from '@sa/core';
import { z } from 'zod';

const byId = z.object({ id: idSchema });

export const backupStatusSchema = z.object({
  folder: z.string(),
  isDefaultFolder: z.boolean(),
  lastSuccessAt: z.string().nullable(),
  lastError: z.object({ at: z.string(), message: z.string() }).nullable(),
  fileCount: z.number().int(),
});
export type BackupStatus = z.infer<typeof backupStatusSchema>;

/**
 * Every call the renderer can make into the main process, with zod schemas for both directions.
 * To add one: declare it here, then implement it in the feature's handler object under
 * src/main/features/<feature>/ (src/main/handlers.ts spreads them together). The preload bridge
 * and `window.api.invoke` pick it up with full types.
 */
export const ipcContract = {
  // App
  'app:info': {
    input: z.void(),
    output: z.object({
      name: z.string(),
      version: z.string(),
      platform: z.string(),
      dataDir: z.string(),
      logDir: z.string(),
    }),
  },
  /** Whether startup succeeded. When the database can't be opened, the app shows an error screen. */
  'app:status': {
    input: z.void(),
    output: z.discriminatedUnion('ok', [
      z.object({ ok: z.literal(true) }),
      z.object({ ok: z.literal(false), error: z.string(), dbFile: z.string() }),
    ]),
  },
  'app:open-folder': {
    input: z.object({ folder: z.enum(['data', 'logs']) }),
    output: z.void(),
  },
  'app:quit': { input: z.void(), output: z.void() },

  // Backups
  'backup:status': { input: z.void(), output: backupStatusSchema },
  'backup:run': { input: z.void(), output: backupStatusSchema },
  /** Opens a folder picker; null when the user cancels. */
  'backup:choose-folder': { input: z.void(), output: backupStatusSchema.nullable() },
  'backup:use-default-folder': { input: z.void(), output: backupStatusSchema },
  'backup:open-folder': { input: z.void(), output: z.void() },

  // Grade Calc
  'course:list': { input: z.void(), output: z.array(courseSummarySchema) },
  'course:get': { input: byId, output: courseDetailSchema },
  'course:create': { input: courseCreateSchema, output: courseSchema },
  'course:update': { input: courseUpdateSchema, output: courseSchema },
  'course:delete': { input: byId, output: z.void() },
  'category:create': { input: categoryCreateSchema, output: gradeCategorySchema },
  'category:update': { input: categoryUpdateSchema, output: gradeCategorySchema },
  'category:delete': { input: byId, output: z.void() },
  'assignment:create': { input: assignmentCreateSchema, output: assignmentSchema },
  'assignment:update': { input: assignmentUpdateSchema, output: assignmentSchema },
  'assignment:delete': { input: byId, output: z.void() },
} as const;

export type IpcContract = typeof ipcContract;
export type IpcChannel = keyof IpcContract;
/** What the renderer passes in (before validation). */
export type IpcInput<C extends IpcChannel> = z.input<IpcContract[C]['input']>;
/** What a main-process handler receives (after validation, defaults applied). */
export type IpcParsedInput<C extends IpcChannel> = z.output<IpcContract[C]['input']>;
export type IpcOutput<C extends IpcChannel> = z.output<IpcContract[C]['output']>;

/** Shape of `window.api`, exposed by the preload script. */
export interface RendererApi {
  invoke<C extends IpcChannel>(channel: C, input?: IpcInput<C>): Promise<IpcOutput<C>>;
}
