import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }));

const { createIpcDispatcher } = await import('./ipc');

const info = { name: 'School Assistant', version: '0.1.0', platform: 'win32', dataDir: 'C:\\data' };

describe('createIpcDispatcher', () => {
  it('returns the handler output when it matches the contract', async () => {
    const dispatch = createIpcDispatcher({ 'app:info': () => info });
    await expect(dispatch('app:info', undefined)).resolves.toEqual(info);
  });

  it('rejects input that does not match the contract', async () => {
    const dispatch = createIpcDispatcher({ 'app:info': () => info });
    await expect(dispatch('app:info', { unexpected: true })).rejects.toThrow();
  });

  it('rejects handler output that does not match the contract', async () => {
    const dispatch = createIpcDispatcher({
      'app:info': () => ({ ...info, version: 1 }) as unknown as typeof info,
    });
    await expect(dispatch('app:info', undefined)).rejects.toThrow();
  });

  it('rejects unknown channels', async () => {
    const dispatch = createIpcDispatcher({ 'app:info': () => info });
    await expect(dispatch('nope' as 'app:info', undefined)).rejects.toThrow(/Unknown IPC channel/);
  });
});
