import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron-log/main', () => ({ default: {} }));

const { pruneLogs } = await import('./log');

describe('pruneLogs', () => {
  it('keeps the newest days and never touches other files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sa-logs-'));
    const names = [
      'main-2026-09-20.log',
      'main-2026-09-21.log',
      'main-2026-09-21.old.log',
      'main-2026-09-22.log',
      'main-2026-09-23.log',
      'renderer.log',
      'notes.txt',
    ];
    for (const name of names) writeFileSync(join(dir, name), 'x');

    expect(pruneLogs(dir, 2).sort()).toEqual([
      'main-2026-09-20.log',
      'main-2026-09-21.log',
      'main-2026-09-21.old.log',
    ]);
    expect(readdirSync(dir).sort()).toEqual([
      'main-2026-09-22.log',
      'main-2026-09-23.log',
      'notes.txt',
      'renderer.log',
    ]);
  });

  it('does nothing when the folder does not exist yet', () => {
    expect(pruneLogs(join(tmpdir(), 'sa-logs-missing', String(Date.now())))).toEqual([]);
  });
});
