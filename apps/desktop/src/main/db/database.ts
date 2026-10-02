import Database from 'better-sqlite3';
import { type BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3';
import { type MigrateResult, migrate } from './migrate';
import { migrations } from './migrations';
import * as schema from './schema';

export type Db = BetterSQLite3Database<typeof schema>;

export interface AppDatabase {
  /** Raw connection, for pragmas and `VACUUM INTO`. */
  sqlite: Database.Database;
  db: Db;
  migration: MigrateResult;
  close(): void;
}

/**
 * Opens (or creates) the database file, applies pending migrations, and returns a Drizzle
 * handle. Throws if the file can't be opened or migrated; the file is then left unchanged.
 * Pass ':memory:' in tests.
 */
export function openDatabase(file: string): AppDatabase {
  const sqlite = new Database(file);
  try {
    sqlite.pragma('busy_timeout = 5000');
    // Migrate (or refuse) before anything else writes to the file.
    const migration = migrate(sqlite, migrations);
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('synchronous = NORMAL');
    sqlite.pragma('foreign_keys = ON');
    return {
      sqlite,
      db: drizzle(sqlite, { schema }),
      migration,
      close: () => {
        if (sqlite.open) sqlite.close();
      },
    };
  } catch (error) {
    sqlite.close();
    throw error;
  }
}
