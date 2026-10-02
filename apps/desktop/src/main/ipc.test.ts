import { describe, expect, it, vi } from 'vitest';
import { stubLogger } from './test/helpers';

const handle = vi.fn();
vi.mock('electron', () => ({ ipcMain: { handle } }));

const { createIpcDispatcher, registerIpcHandlers } = await import('./ipc');
type IpcHandlers = import('./ipc').IpcHandlers;

const info = {
  name: 'School Assistant',
  version: '0.1.0',
  platform: 'win32',
  dataDir: 'C:\\data',
  logDir: 'C:\\data\\logs',
};

/** Tests only exercise a few channels. */
function handlers(partial: Partial<IpcHandlers>): IpcHandlers {
  return partial as IpcHandlers;
}

describe('createIpcDispatcher', () => {
  it('returns the handler output when it matches the contract', async () => {
    const dispatch = createIpcDispatcher(handlers({ 'app:info': () => info }));
    await expect(dispatch('app:info', undefined)).resolves.toEqual(info);
  });

  it('rejects input that does not match the contract', async () => {
    const dispatch = createIpcDispatcher(handlers({ 'app:info': () => info }));
    await expect(dispatch('app:info', { unexpected: true })).rejects.toThrow();
  });

  it('passes parsed input, with schema defaults applied, to the handler', async () => {
    const create = vi.fn((input) => ({
      ...input,
      id: '0b9d6c53-3c4e-4d84-9a4e-0f1d1c2b3a4f',
      color: '#6366f1',
      createdAt: '2026-10-02T15:00:00.000Z',
      updatedAt: '2026-10-02T15:00:00.000Z',
    }));
    const dispatch = createIpcDispatcher(handlers({ 'course:create': create }));
    await dispatch('course:create', { name: '  Calc  ' });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Calc', code: '', grading: 'weighted' }),
    );
  });

  it('rejects handler output that does not match the contract', async () => {
    const dispatch = createIpcDispatcher(
      handlers({ 'app:info': () => ({ ...info, version: 1 }) as unknown as typeof info }),
    );
    await expect(dispatch('app:info', undefined)).rejects.toThrow();
  });

  it('rejects unknown channels', async () => {
    const dispatch = createIpcDispatcher(handlers({ 'app:info': () => info }));
    await expect(dispatch('nope' as 'app:info', undefined)).rejects.toThrow(/Unknown IPC channel/);
  });
});

describe('registerIpcHandlers', () => {
  it('logs a failing handler and passes the error on', async () => {
    const log = stubLogger();
    handle.mockClear();
    registerIpcHandlers(
      handlers({
        'course:list': () => {
          throw new Error('disk on fire');
        },
      }),
      log,
    );
    const registered = handle.mock.calls.find(([channel]) => channel === 'course:list');
    const listener = registered?.[1] as (event: unknown, raw: unknown) => Promise<unknown>;
    await expect(listener({}, undefined)).rejects.toThrow('disk on fire');
    expect(log.error).toHaveBeenCalledWith('IPC course:list failed', expect.any(Error));
  });
});
