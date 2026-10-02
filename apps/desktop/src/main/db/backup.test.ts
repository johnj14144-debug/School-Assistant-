import { chmodSync, existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { fakeClock, stubLogger, tempDir } from '../test/helpers';
import { BackupService, backupFileName } from './backup';
import { openDatabase } from './database';
import { SettingsService } from './settings';

function setup(start = '2026-10-02T15:00:00') {
  const database = openDatabase(join(tempDir('sa-live-'), 'school-assistant.db'));
  database.sqlite.exec("insert into setting (key, value, updated_at) values ('probe', '1', 'x')");
  const log = stubLogger();
  const clock = fakeClock(start);
  const settings = new SettingsService(database.db, log, clock.now);
  const defaultFolder = join(tempDir('sa-backups-'), 'Backups');
  const backup = new BackupService({
    sqlite: database.sqlite,
    settings,
    defaultFolder,
    log,
    now: clock.now,
  });
  return { database, log, clock, settings, backup, defaultFolder };
}

function backupsIn(folder: string): string[] {
  return readdirSync(folder).sort();
}

describe('BackupService', () => {
  it('writes a readable copy named after the local date into the default folder', () => {
    const { backup, defaultFolder } = setup();
    expect(backup.isDue()).toBe(true);

    const status = backup.backUpNow();

    expect(backupsIn(defaultFolder)).toEqual(['school-assistant-2026-10-02.db']);
    expect(status).toMatchObject({ folder: defaultFolder, isDefaultFolder: true, fileCount: 1 });
    expect(status.lastSuccessAt).not.toBeNull();
    expect(backup.isDue()).toBe(false);
    const copy = new Database(join(defaultFolder, backupFileName('2026-10-02')), {
      readonly: true,
    });
    expect(copy.prepare("select value from setting where key = 'probe'").get()).toEqual({
      value: '1',
    });
    copy.close();
  });

  it('replaces today’s file when run again the same day', () => {
    const { backup, defaultFolder } = setup();
    backup.backUpNow();
    backup.backUpNow();
    expect(backupsIn(defaultFolder)).toEqual(['school-assistant-2026-10-02.db']);
  });

  it('becomes due again on the next local day', () => {
    const { backup, clock } = setup();
    backup.backUpNow();
    clock.set('2026-10-03T08:00:00');
    expect(backup.isDue()).toBe(true);
    backup.backUpIfDue();
    expect(backup.status().fileCount).toBe(2);
  });

  it('keeps the newest 14 days plus the first of each month, and leaves other files alone', () => {
    const { backup, defaultFolder } = setup('2026-10-20T12:00:00');
    backup.backUpNow();
    for (let day = 1; day <= 19; day += 1) {
      writeFileSync(
        join(defaultFolder, backupFileName(`2026-10-${String(day).padStart(2, '0')}`)),
        '',
      );
    }
    writeFileSync(join(defaultFolder, backupFileName('2026-09-15')), '');
    writeFileSync(join(defaultFolder, backupFileName('2026-09-30')), '');
    writeFileSync(join(defaultFolder, 'school-assistant-2026-10-05.db.partial'), '');
    writeFileSync(join(defaultFolder, 'my notes.txt'), '');

    backup.backUpNow();

    const kept = backupsIn(defaultFolder);
    expect(kept).toContain('my notes.txt');
    expect(kept).toContain(backupFileName('2026-09-15')); // first of September
    expect(kept).toContain(backupFileName('2026-10-01')); // first of October
    expect(kept).not.toContain(backupFileName('2026-09-30'));
    expect(kept).not.toContain(backupFileName('2026-10-06'));
    expect(kept).toContain(backupFileName('2026-10-07'));
    expect(kept).toContain(backupFileName('2026-10-20'));
    expect(kept.filter((n) => n.endsWith('.partial'))).toEqual([]);
    expect(backup.status().fileCount).toBe(16);
  });

  it('switches to a folder the user picks, and back to the default', () => {
    const { backup, defaultFolder } = setup();
    const picked = tempDir('sa-onedrive-');

    const status = backup.setFolder(picked);
    expect(status).toMatchObject({ folder: picked, isDefaultFolder: false, fileCount: 1 });
    expect(backupsIn(picked)).toEqual(['school-assistant-2026-10-02.db']);

    expect(backup.setFolder(null)).toMatchObject({ folder: defaultFolder, isDefaultFolder: true });
  });

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'keeps the old folder when the new one cannot be written',
    () => {
      const { backup, defaultFolder } = setup();
      const locked = tempDir('sa-locked-');
      chmodSync(locked, 0o500);
      expect(() => backup.setFolder(join(locked, 'inside'))).toThrow();
      expect(backup.status().folder).toBe(defaultFolder);
    },
  );

  it('records a failure and rethrows it', () => {
    const { backup, settings, log } = setup();
    // A file where the folder should be makes mkdir fail.
    const blocker = join(tempDir(), 'not-a-folder');
    writeFileSync(blocker, '');
    settings.set('backup.folder', blocker);

    expect(() => backup.backUpNow()).toThrow();
    expect(backup.status().lastError?.message).toBeTruthy();
    expect(log.error).toHaveBeenCalled();
    expect(existsSync(`${blocker}/school-assistant-2026-10-02.db`)).toBe(false);

    // backUpIfDue swallows the error (it is already recorded).
    expect(() => backup.backUpIfDue()).not.toThrow();
  });

  it('clears the recorded error after the next success', () => {
    const { backup, settings } = setup();
    settings.set('backup.lastError', { at: '2026-10-01T10:00:00.000Z', message: 'Disk full' });
    expect(backup.backUpNow().lastError).toBeNull();
  });
});
