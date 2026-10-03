# 0008 — Migrations: drizzle-kit SQL, embedded in the bundle, applied by our own runner

**Status:** Accepted (2026-10-02)

## Context
ADR 0005 chose Drizzle for typed queries and migrations. Drizzle's own migrator reads a
`migrations/` folder from disk at runtime, which means copying that folder into the Electron
build and the asar archive. It also records migrations in its own table, can't turn foreign
keys off around a table rebuild (SQLite ignores `PRAGMA foreign_keys` inside a transaction),
and has no notion of "this database is newer than this app", which matters once the user can
restore backups (M8).

## Decision
- `src/main/db/schema.ts` is the source of truth. `pnpm --filter @sa/desktop db:generate`
  (drizzle-kit) writes the next numbered SQL file into `src/main/db/migrations/`; both are
  committed.
- The SQL files are embedded at build time (`import.meta.glob(..., { query: '?raw' })`), so
  nothing is read from disk at runtime.
- `src/main/db/migrate.ts` applies them: `PRAGMA user_version` = number of applied migrations;
  all pending migrations run in **one transaction** with foreign keys off, then
  `PRAGMA foreign_key_check` must come back empty before commit. Any failure rolls back and the
  file is untouched; the app shows an error screen.
- A database whose `user_version` is higher than the number of migrations the app knows is
  refused (`DatabaseTooNewError`) rather than opened.
- A test checks that the migrated tables and columns match `schema.ts`.

## Consequences
- Never edit or regenerate a migration after it has run on the owner's laptop; add a new one.
- drizzle-kit's `meta/` snapshots must stay committed (it diffs against them).
- IDs are UUID text generated in main; settings are stored as JSON text (Drizzle's JSON mode
  turns a JS `null` into SQL NULL, which loses the difference between "unset" and "null").
