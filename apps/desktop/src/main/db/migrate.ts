import type BetterSqlite3 from 'better-sqlite3';

export interface Migration {
  /** File name without extension, e.g. `0000_init`. */
  name: string;
  sql: string;
}

/** The database was written by a newer version of the app; opening it could lose data. */
export class DatabaseTooNewError extends Error {
  constructor(
    readonly found: number,
    readonly known: number,
  ) {
    super(
      `This database was created by a newer version of School Assistant (schema ${found}; this ` +
        `version knows up to ${known}). Install the newer version, or restore an older backup.`,
    );
    this.name = 'DatabaseTooNewError';
  }
}

export class MigrationError extends Error {
  constructor(
    readonly migration: string,
    cause: unknown,
  ) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    super(
      `Updating the database failed at migration ${migration}: ${reason}. Nothing was changed.`,
      { cause },
    );
    this.name = 'MigrationError';
  }
}

export interface MigrateResult {
  from: number;
  to: number;
  applied: string[];
}

/**
 * Brings the database up to date. `PRAGMA user_version` counts the applied migrations. All
 * pending migrations run in one transaction, so a failure leaves the file exactly as it was
 * (ADR 0008). Foreign keys are off while migrating (table rebuilds need that) and checked
 * before commit.
 */
export function migrate(sqlite: BetterSqlite3.Database, migrations: Migration[]): MigrateResult {
  const from = sqlite.pragma('user_version', { simple: true }) as number;
  if (from > migrations.length) throw new DatabaseTooNewError(from, migrations.length);
  const pending = migrations.slice(from);
  if (pending.length === 0) return { from, to: from, applied: [] };

  sqlite.pragma('foreign_keys = OFF');
  try {
    sqlite.transaction(() => {
      for (const migration of pending) {
        try {
          // drizzle-kit's `--> statement-breakpoint` markers are SQL comments, so the whole
          // file can run at once.
          sqlite.exec(migration.sql);
        } catch (error) {
          throw new MigrationError(migration.name, error);
        }
      }
      const violations = sqlite.pragma('foreign_key_check') as unknown[];
      if (violations.length > 0) {
        const last = pending.at(-1)?.name ?? '?';
        throw new MigrationError(last, new Error(`${violations.length} foreign key violations`));
      }
      sqlite.pragma(`user_version = ${migrations.length}`);
    })();
  } finally {
    sqlite.pragma('foreign_keys = ON');
  }
  return { from, to: migrations.length, applied: pending.map((m) => m.name) };
}
