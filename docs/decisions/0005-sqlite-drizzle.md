# 0005 — SQLite via better-sqlite3 + Drizzle ORM

**Status:** Accepted (2026-10-02)

## Context
A single-user, local-first app needs an embedded database with migrations and good typing.
Native modules are a classic Electron pain point on Windows: compiling needs Visual Studio
Build Tools.

## Decision
- **SQLite** in `%APPDATA%/School Assistant/`, accessed from the main process only.
- **better-sqlite3 13** as the driver: synchronous, fast, and it ships N-API prebuilt binaries
  (win32-x64 included) inside the package. The M0 spike loaded it under Node 22 and Electron 44
  with no compiler.
- **Drizzle ORM** for typed queries and SQL migrations, run on app startup.

## Consequences
- No build tools are needed on the user's laptop.
- `node:sqlite` also works in Electron 44, but Drizzle 0.45 has no driver for it. Reconsider
  when one exists, which would drop the native dependency entirely.
- The database stays out of git (`*.db` is ignored); M6 adds daily backups.
