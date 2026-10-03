import { describe, expect, it } from 'vitest';
import { stubLogger } from '../test/helpers';
import { openDatabase } from './database';
import { settings } from './schema';
import { SettingsService } from './settings';

function setup() {
  const database = openDatabase(':memory:');
  const log = stubLogger();
  return { database, log, service: new SettingsService(database.db, log) };
}

describe('SettingsService', () => {
  it('returns the default until a value is stored', () => {
    const { service } = setup();
    expect(service.get('backup.folder')).toBeNull();
    service.set('backup.folder', 'D:\\OneDrive\\Backups');
    expect(service.get('backup.folder')).toBe('D:\\OneDrive\\Backups');
    service.set('backup.folder', null);
    expect(service.get('backup.folder')).toBeNull();
  });

  it('stores objects as JSON', () => {
    const { service } = setup();
    const error = { at: '2026-10-02T10:00:00.000Z', message: 'Disk full' };
    service.set('backup.lastError', error);
    expect(service.get('backup.lastError')).toEqual(error);
  });

  it('rejects invalid values on write', () => {
    const { service } = setup();
    expect(() => service.set('backup.lastSuccessAt', 'yesterday')).toThrow();
  });

  it('falls back to the default (and warns) when a stored value is invalid', () => {
    const { database, service, log } = setup();
    database.db
      .insert(settings)
      .values({ key: 'backup.lastSuccessAt', value: '42', updatedAt: '2026-10-02T10:00:00.000Z' })
      .run();
    expect(service.get('backup.lastSuccessAt')).toBeNull();
    expect(log.warn).toHaveBeenCalledOnce();
  });
});
