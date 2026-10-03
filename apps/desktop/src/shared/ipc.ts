import {
  assignmentCreateManySchema,
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
  historyViewSchema,
  idSchema,
  sessionCreateSchema,
  sessionUpdateSchema,
  taskCompleteSchema,
  taskCreateSchema,
  taskDetailSchema,
  taskListItemSchema,
  taskSchema,
  taskUpdateSchema,
  timerStateSchema,
  timeSessionSchema,
  todayViewSchema,
  utcInstantSchema,
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
  'assignment:create-many': {
    input: assignmentCreateManySchema,
    output: z.array(assignmentSchema),
  },
  'assignment:update': { input: assignmentUpdateSchema, output: assignmentSchema },
  'assignment:delete': { input: byId, output: z.void() },

  // Tasks
  'task:list': {
    input: z.object({ status: z.enum(['open', 'done']).default('open') }).prefault({}),
    output: z.array(taskListItemSchema),
  },
  'task:get': { input: byId, output: taskDetailSchema },
  /** Task types in use, most used first (suggestions for the type field). */
  'task:types': { input: z.void(), output: z.array(z.string()) },
  'task:create': { input: taskCreateSchema, output: taskSchema },
  'task:update': { input: taskUpdateSchema, output: taskSchema },
  /** Also deletes its subtasks and timer sessions. */
  'task:delete': { input: byId, output: z.void() },
  /** Marks done (stopping its timers) with a note; on a done task, changes the note. */
  'task:complete': { input: taskCompleteSchema, output: taskSchema },
  'task:reopen': { input: byId, output: taskSchema },

  // Today list
  'today:get': { input: z.void(), output: todayViewSchema },
  'today:set': { input: z.object({ id: idSchema, today: z.boolean() }), output: z.void() },
  'today:reorder': { input: z.object({ ids: z.array(idSchema).max(500) }), output: z.void() },

  // Timer
  'timer:state': { input: z.void(), output: timerStateSchema },
  /** `startAt`: "I started at…" (now when left out). */
  'timer:start': {
    input: z.object({ taskId: idSchema, startAt: utcInstantSchema.optional() }),
    output: timerStateSchema,
  },
  'timer:pause': { input: z.void(), output: timerStateSchema },
  'timer:resume': { input: z.void(), output: timerStateSchema },
  /** Stops a task's timer (default: the focus task), or clears the paused task. */
  'timer:stop': {
    input: z.object({ taskId: idSchema.optional() }).default({}),
    output: timerStateSchema,
  },
  'session:create': { input: sessionCreateSchema, output: timeSessionSchema },
  'session:update': { input: sessionUpdateSchema, output: timerStateSchema },
  'session:delete': { input: byId, output: z.void() },
  'history:get': { input: z.void(), output: historyViewSchema },
} as const;

export type IpcContract = typeof ipcContract;
export type IpcChannel = keyof IpcContract;
/** What the renderer passes in (before validation). */
export type IpcInput<C extends IpcChannel> = z.input<IpcContract[C]['input']>;
/** What a main-process handler receives (after validation, defaults applied). */
export type IpcParsedInput<C extends IpcChannel> = z.output<IpcContract[C]['input']>;
export type IpcOutput<C extends IpcChannel> = z.output<IpcContract[C]['output']>;

/**
 * Events the main process pushes to the renderer, with their payloads. The preload script keeps
 * its own list of these names (it can't import runtime code from here).
 */
export interface IpcEvents {
  /** Tasks, the Today list or the timer changed (from any window, the tray or a timer). */
  'tasks:changed': undefined;
}
export type IpcEvent = keyof IpcEvents;

/** Shape of `window.api`, exposed by the preload script. */
export interface RendererApi {
  invoke<C extends IpcChannel>(channel: C, input?: IpcInput<C>): Promise<IpcOutput<C>>;
  /** Listens for a main-process event; returns a function that stops listening. */
  on<E extends IpcEvent>(event: E, listener: (payload: IpcEvents[E]) => void): () => void;
}
