import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type Mock, vi } from 'vitest';
import type { Logger } from '../log';

/** A fresh empty folder under the OS temp dir. */
export function tempDir(prefix = 'sa-test-'): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

type LogFn = (...params: unknown[]) => void;

/** A logger whose calls can be asserted on. */
export function stubLogger(): { [K in keyof Logger]: Mock<LogFn> } {
  return { info: vi.fn<LogFn>(), warn: vi.fn<LogFn>(), error: vi.fn<LogFn>() };
}

/** A controllable clock for services that take `now`. */
export function fakeClock(start: string) {
  let current = new Date(start);
  return {
    now: () => new Date(current),
    set: (iso: string) => {
      current = new Date(iso);
    },
  };
}
