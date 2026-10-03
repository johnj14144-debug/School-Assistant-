import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { stubLogger, tempDir } from './test/helpers';

vi.mock('electron', () => ({
  app: { getName: () => 'School Assistant', getVersion: () => '0.1.0', quit: vi.fn() },
  shell: { openPath: vi.fn(async () => '') },
  dialog: { showOpenDialog: vi.fn() },
  BrowserWindow: { getFocusedWindow: () => null },
}));

const { createHandlers } = await import('./handlers');
const { startRuntime } = await import('./runtime');

function paths(dir = tempDir()) {
  return {
    dataDir: dir,
    logDir: join(dir, 'logs'),
    dbFile: join(dir, 'school-assistant.db'),
    defaultBackupFolder: join(dir, 'Backups'),
  };
}

describe('createHandlers', () => {
  it('serves every feature when the database opened', async () => {
    const p = paths();
    const runtime = startRuntime(p, stubLogger());
    const handlers = createHandlers(p, runtime);
    expect(await handlers['app:status']()).toEqual({ ok: true });
    expect(await handlers['course:list']()).toEqual([]);
    expect(await handlers['task:list']({ status: 'open' })).toEqual([]);
    expect(await handlers['timer:state']()).toEqual({ focus: null, paused: null, background: [] });
    expect(await handlers['backup:status']()).toMatchObject({ folder: p.defaultBackupFolder });
    if (runtime.ok) runtime.database.close();
  });

  it('reports the startup error and refuses data calls when the database failed', async () => {
    const p = paths();
    const handlers = createHandlers(p, { ok: false, error: 'Disk is read-only' });
    expect(await handlers['app:status']()).toEqual({
      ok: false,
      error: 'Disk is read-only',
      dbFile: p.dbFile,
    });
    expect(() => handlers['course:list']()).toThrow(/not available/);
    expect(await handlers['app:info']()).toMatchObject({ dataDir: p.dataDir });
  });
});

describe('startRuntime', () => {
  it('returns the error instead of throwing when the file is not a database', async () => {
    const p = paths();
    const { writeFileSync } = await import('node:fs');
    writeFileSync(p.dbFile, 'not a database '.repeat(100));
    const log = stubLogger();
    const runtime = startRuntime(p, log);
    expect(runtime.ok).toBe(false);
    expect(log.error).toHaveBeenCalled();
  });
});
