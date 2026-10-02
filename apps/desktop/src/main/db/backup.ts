import { existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { datesToPrune } from '@sa/core';
import type BetterSqlite3 from 'better-sqlite3';
import { localDateKey } from '../dates';
import type { Logger } from '../log';
import type { SettingsService } from './settings';

const BACKUP_FILE = /^school-assistant-(\d{4}-\d{2}-\d{2})\.db$/;
const PARTIAL_FILE = /^school-assistant-\d{4}-\d{2}-\d{2}\.db\.partial$/;
const RETENTION = { keepLatest: 14, keepFirstOfMonth: true };

export function backupFileName(dateKey: string): string {
  return `school-assistant-${dateKey}.db`;
}

export interface BackupStatus {
  folder: string;
  isDefaultFolder: boolean;
  lastSuccessAt: string | null;
  lastError: { at: string; message: string } | null;
  fileCount: number;
}

export interface BackupDeps {
  sqlite: BetterSqlite3.Database;
  settings: SettingsService;
  /** Used until the user picks a folder in Settings. */
  defaultFolder: string;
  log: Logger;
  now?: () => Date;
}

/**
 * Daily copies of the database (`VACUUM INTO`) into a folder the user picks: one file per
 * local day, the newest 14 plus the first of every month kept. A copy is written under a
 * `.partial` name and renamed when complete, so a crash or a syncing cloud folder never sees
 * half a file.
 */
export class BackupService {
  private readonly now: () => Date;

  constructor(private readonly deps: BackupDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  folder(): string {
    return this.deps.settings.get('backup.folder') ?? this.deps.defaultFolder;
  }

  status(): BackupStatus {
    const { settings } = this.deps;
    return {
      folder: this.folder(),
      isDefaultFolder: settings.get('backup.folder') === null,
      lastSuccessAt: settings.get('backup.lastSuccessAt'),
      lastError: settings.get('backup.lastError'),
      fileCount: this.backupFiles(this.folder()).length,
    };
  }

  /** True when today's file is missing from the current folder. */
  isDue(): boolean {
    return !existsSync(join(this.folder(), backupFileName(localDateKey(this.now()))));
  }

  /** Writes (or replaces) today's backup and prunes old ones. Throws if it fails. */
  backUpNow(): BackupStatus {
    const folder = this.folder();
    let file: string;
    try {
      file = this.writeBackup(folder);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.deps.log.error(`Backup to ${folder} failed`, error);
      this.deps.settings.set('backup.lastError', { at: this.now().toISOString(), message });
      throw error;
    }
    this.recordSuccess(folder, file);
    return this.status();
  }

  /** For the timer: backs up when due, never throws. */
  backUpIfDue(): void {
    try {
      if (this.isDue()) this.backUpNow();
    } catch {
      // Already logged and recorded in backup.lastError.
    }
  }

  /**
   * Switches to `folder` (null = the default folder). Backs up into it first, so a folder
   * that can't be written is rejected and the old setting stays.
   */
  setFolder(folder: string | null): BackupStatus {
    const target = folder ?? this.deps.defaultFolder;
    const file = this.writeBackup(target);
    this.deps.settings.set('backup.folder', folder);
    this.deps.log.info(`Backup folder set to ${target}`);
    this.recordSuccess(target, file);
    return this.status();
  }

  /** Checks shortly after startup and then every 30 minutes. Returns a stop function. */
  startSchedule(firstDelayMs = 60_000, intervalMs = 30 * 60_000): () => void {
    const first = setTimeout(() => this.backUpIfDue(), firstDelayMs);
    const every = setInterval(() => this.backUpIfDue(), intervalMs);
    return () => {
      clearTimeout(first);
      clearInterval(every);
    };
  }

  private recordSuccess(folder: string, file: string): void {
    this.deps.settings.set('backup.lastSuccessAt', this.now().toISOString());
    this.deps.settings.set('backup.lastError', null);
    this.deps.log.info(`Backup written: ${file}`);
    this.prune(folder);
  }

  private writeBackup(folder: string): string {
    mkdirSync(folder, { recursive: true });
    const file = join(folder, backupFileName(localDateKey(this.now())));
    const partial = `${file}.partial`;
    rmSync(partial, { force: true });
    try {
      this.deps.sqlite.prepare('VACUUM INTO ?').run(partial);
      renameSync(partial, file);
    } catch (error) {
      rmSync(partial, { force: true });
      throw error;
    }
    return file;
  }

  private backupFiles(folder: string): { name: string; date: string }[] {
    let names: string[];
    try {
      names = readdirSync(folder);
    } catch {
      return [];
    }
    return names.flatMap((name) => {
      const date = BACKUP_FILE.exec(name)?.[1];
      return date ? [{ name, date }] : [];
    });
  }

  private prune(folder: string): void {
    try {
      const files = this.backupFiles(folder);
      const prune = new Set(
        datesToPrune(
          files.map((f) => f.date),
          RETENTION,
        ),
      );
      for (const file of files) {
        if (prune.has(file.date)) rmSync(join(folder, file.name), { force: true });
      }
      // Leftovers from a crash mid-copy.
      for (const name of readdirSync(folder)) {
        if (PARTIAL_FILE.test(name)) rmSync(join(folder, name), { force: true });
      }
    } catch (error) {
      this.deps.log.warn(`Could not prune old backups in ${folder}`, error);
    }
  }
}
