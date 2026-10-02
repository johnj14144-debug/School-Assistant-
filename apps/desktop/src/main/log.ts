import { readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { datesToPrune } from '@sa/core';
import log from 'electron-log/main';
import { localDateKey } from './dates';

/** The slice of the logger that services use; tests pass a stub. */
export interface Logger {
  info(...params: unknown[]): void;
  warn(...params: unknown[]): void;
  error(...params: unknown[]): void;
}

const KEEP_DAYS = 7;
const LOG_FILE = /^main-(\d{4}-\d{2}-\d{2})(\.old)?\.log$/;

/** Deletes daily log files beyond the newest `keepDays` dates. Returns the deleted names. */
export function pruneLogs(logDir: string, keepDays = KEEP_DAYS): string[] {
  let names: string[];
  try {
    names = readdirSync(logDir);
  } catch {
    return [];
  }
  const dated = names.flatMap((name) => {
    const match = LOG_FILE.exec(name);
    return match?.[1] ? [{ name, date: match[1] }] : [];
  });
  const prune = new Set(
    datesToPrune(
      dated.map((f) => f.date),
      { keepLatest: keepDays, keepFirstOfMonth: false },
    ),
  );
  const deleted = dated.filter((f) => prune.has(f.date)).map((f) => f.name);
  for (const name of deleted) rmSync(join(logDir, name), { force: true });
  return deleted;
}

/**
 * Sends the main-process log to `<logDir>/main-YYYY-MM-DD.log` (one file per local day, 7 days
 * kept) and records uncaught errors. Call once, as early as possible.
 */
export function setupLog(logDir: string): void {
  log.transports.file.level = 'info';
  log.transports.file.maxSize = 5 * 1024 * 1024;
  log.transports.file.resolvePathFn = (_vars, message) =>
    join(logDir, `main-${localDateKey(message?.date ?? new Date())}.log`);
  log.errorHandler.startCatching({ showDialog: false });
  try {
    const deleted = pruneLogs(logDir);
    if (deleted.length > 0) log.info(`Deleted old log files: ${deleted.join(', ')}`);
  } catch (error) {
    log.warn('Could not prune old log files', error);
  }
}

export { log };
