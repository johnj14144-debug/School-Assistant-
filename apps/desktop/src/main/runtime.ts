import { BackupService } from './db/backup';
import { type AppDatabase, openDatabase } from './db/database';
import { SettingsService } from './db/settings';
import { GradesService } from './features/grades/service';
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
  const services: Services = {
    settings,
    backup: new BackupService({
      sqlite: database.sqlite,
      settings,
      defaultFolder: paths.defaultBackupFolder,
      log,
    }),
    grades: new GradesService({ db: database.db }),
  };
  log.info(`Database ready: ${paths.dbFile}`);
  return { ok: true, database, services };
}
