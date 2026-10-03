import { BackupService } from './db/backup';
import { type AppDatabase, openDatabase } from './db/database';
import { SettingsService } from './db/settings';
import { CalendarService } from './features/calendar/service';
import { GradesService } from './features/grades/service';
import { PlannerService } from './features/planner/service';
import { TasksService } from './features/tasks/service';
import { TimerService } from './features/tasks/timer';
import type { Logger } from './log';

export interface AppPaths {
  dataDir: string;
  logDir: string;
  dbFile: string;
  defaultBackupFolder: string;
}

export interface Services {
  settings: SettingsService;
  backup: BackupService;
  grades: GradesService;
  tasks: TasksService;
  timer: TimerService;
  calendar: CalendarService;
  planner: PlannerService;
  /** Fires after any change to tasks or the timer, so the window and tray can refresh. */
  taskChanges: ChangeSignal;
  /** Fires after any change to fixed events or blocks. */
  calendarChanges: ChangeSignal;
}

/** A tiny listener list. A failing listener is logged and doesn't stop the others. */
export class ChangeSignal {
  private readonly listeners = new Set<() => void>();

  constructor(private readonly log: Logger) {}

  on(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit = (): void => {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (error) {
        this.log.error('A change listener failed', error);
      }
    }
  };
}

/** Everything that depends on the database, or why it couldn't start. */
export type Runtime =
  | { ok: true; database: AppDatabase; services: Services }
  | { ok: false; error: string };

/** Opens the database (migrating it) and builds the services. Never throws. */
export function startRuntime(paths: AppPaths, log: Logger): Runtime {
  let database: AppDatabase;
  try {
    database = openDatabase(paths.dbFile);
  } catch (error) {
    log.error(`Could not open the database at ${paths.dbFile}`, error);
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
  const { migration } = database;
  if (migration.applied.length > 0) {
    log.info(
      `Database schema ${migration.from} → ${migration.to} (${migration.applied.join(', ')})`,
    );
  }
  const settings = new SettingsService(database.db, log);
  const taskChanges = new ChangeSignal(log);
  const calendarChanges = new ChangeSignal(log);
  const tasks = new TasksService({ db: database.db, settings, onChange: taskChanges.emit });
  const services: Services = {
    settings,
    backup: new BackupService({
      sqlite: database.sqlite,
      settings,
      defaultFolder: paths.defaultBackupFolder,
      log,
    }),
    grades: new GradesService({ db: database.db }),
    tasks,
    timer: new TimerService({ db: database.db, settings, tasks, onChange: taskChanges.emit }),
    calendar: new CalendarService({ db: database.db, settings, onChange: calendarChanges.emit }),
    planner: new PlannerService({ db: database.db, settings, onChange: calendarChanges.emit }),
    taskChanges,
    calendarChanges,
  };
  log.info(`Database ready: ${paths.dbFile}`);
  return { ok: true, database, services };
}
