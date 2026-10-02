import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { getTableConfig, type SQLiteTable } from 'drizzle-orm/sqlite-core';
import { describe, expect, it } from 'vitest';
import { openDatabase } from './database';
import { DatabaseTooNewError, MigrationError, migrate } from './migrate';
import { migrations } from './migrations';
import * as schema from './schema';

function tempFile(name = 'test.db'): string {
  return join(mkdtempSync(join(tmpdir(), 'sa-db-')), name);
}

function userVersion(sqlite: Database.Database): number {
  return sqlite.pragma('user_version', { simple: true }) as number;
}

function tableNames(sqlite: Database.Database): string[] {
  return (
    sqlite.prepare("select name from sqlite_master where type = 'table' order by name").all() as {
      name: string;
    }[]
  ).map((r) => r.name);
}

describe('migrations', () => {
  it('are numbered 0000, 0001, … without gaps', () => {
    expect(migrations.length).toBeGreaterThan(0);
    migrations.forEach((m, i) => {
      expect(m.name.slice(0, 4)).toBe(String(i).padStart(4, '0'));
    });
  });

  it('create exactly the tables and columns in schema.ts', () => {
    const { sqlite, close } = openDatabase(':memory:');
    const tables = Object.values(schema).map((t) => getTableConfig(t as SQLiteTable));
    expect(tableNames(sqlite)).toEqual(tables.map((t) => t.name).sort());
    for (const table of tables) {
      const columns = sqlite.pragma(`table_info(${table.name})`) as {
        name: string;
        notnull: number;
      }[];
      expect(columns.map((c) => [c.name, c.notnull === 1])).toEqual(
        table.columns.map((c) => [c.name, c.notNull]),
      );
    }
    close();
  });
});

describe('migrate', () => {
  const ok = [
    { name: '0000_a', sql: 'create table a (id integer primary key);' },
    {
      name: '0001_b',
      sql: 'create table b (id integer primary key, a_id integer references a(id));',
    },
  ];

  it('applies pending migrations once and records the version', () => {
    const sqlite = new Database(':memory:');
    expect(migrate(sqlite, ok.slice(0, 1))).toEqual({ from: 0, to: 1, applied: ['0000_a'] });
    expect(migrate(sqlite, ok)).toEqual({ from: 1, to: 2, applied: ['0001_b'] });
    expect(migrate(sqlite, ok)).toEqual({ from: 2, to: 2, applied: [] });
    expect(userVersion(sqlite)).toBe(2);
    expect(tableNames(sqlite)).toEqual(['a', 'b']);
  });

  it('rolls back every pending migration when one fails', () => {
    const sqlite = new Database(':memory:');
    const broken = [
      ...ok,
      { name: '0002_broken', sql: 'create table c (id integer primary key); nonsense;' },
    ];
    expect(() => migrate(sqlite, broken)).toThrow(MigrationError);
    expect(() => migrate(sqlite, broken)).toThrow(/0002_broken/);
    expect(userVersion(sqlite)).toBe(0);
    expect(tableNames(sqlite)).toEqual([]);
  });

  it('rejects a migration that leaves broken foreign keys', () => {
    const sqlite = new Database(':memory:');
    migrate(sqlite, ok);
    const orphan = [
      ...ok,
      { name: '0002_orphan', sql: 'insert into b (id, a_id) values (1, 99);' },
    ];
    expect(() => migrate(sqlite, orphan)).toThrow(/foreign key/);
    expect(userVersion(sqlite)).toBe(2);
    expect(sqlite.prepare('select count(*) as n from b').get()).toEqual({ n: 0 });
    expect(sqlite.pragma('foreign_keys', { simple: true })).toBe(1);
  });

  it('refuses a database from a newer version of the app', () => {
    const sqlite = new Database(':memory:');
    sqlite.pragma('user_version = 5');
    expect(() => migrate(sqlite, ok)).toThrow(DatabaseTooNewError);
  });
});

describe('openDatabase', () => {
  it('creates the file in WAL mode with foreign keys on, and reopens it', () => {
    const file = tempFile();
    const first = openDatabase(file);
    expect(first.migration.applied).toHaveLength(migrations.length);
    expect(first.sqlite.pragma('journal_mode', { simple: true })).toBe('wal');
    expect(first.sqlite.pragma('foreign_keys', { simple: true })).toBe(1);
    first.close();

    const second = openDatabase(file);
    expect(second.migration).toEqual({
      from: migrations.length,
      to: migrations.length,
      applied: [],
    });
    second.close();
  });

  it('refuses a database that is too new without changing the file', () => {
    const file = tempFile();
    const raw = new Database(file);
    raw.pragma(`user_version = ${migrations.length + 1}`);
    raw.close();
    const before = readFileSync(file);
    expect(() => openDatabase(file)).toThrow(DatabaseTooNewError);
    expect(readFileSync(file).equals(before)).toBe(true);
  });

  it('throws on a file that is not a database', () => {
    const file = tempFile();
    writeFileSync(file, 'definitely not sqlite, just some text '.repeat(40));
    expect(() => openDatabase(file)).toThrow();
  });
});

describe('migration 0001 (category kind)', () => {
  it('upgrades a v1 database with data, keeping categories and links', () => {
    const file = tempFile();
    const v1 = new Database(file);
    migrate(v1, migrations.slice(0, 1));
    v1.exec(`
      insert into course values ('c1', 'Calc', '', '', 'enrolled', 'weighted', '[]', '#6366f1', 'x', 'x');
      insert into grade_category values ('g1', 'c1', 'Homework', 40, 1, 0);
      insert into assignment values ('a1', 'c1', 'g1', 'HW 1', null, 10, 9, 0, 'x', 'x');
    `);
    v1.close();

    const upgraded = openDatabase(file);
    const { sqlite } = upgraded;
    expect(
      sqlite.prepare('select id, name, kind, weight, drop_lowest from grade_category').all(),
    ).toEqual([{ id: 'g1', name: 'Homework', kind: 'regular', weight: 40, drop_lowest: 1 }]);
    expect(sqlite.prepare('select category_id from assignment').get()).toEqual({
      category_id: 'g1',
    });
    // The rebuilt table keeps its checks and the assignment foreign key still points at it.
    expect(() =>
      sqlite.exec("insert into grade_category values ('g2', 'c1', 'X', 'weird', 1, 0, 1)"),
    ).toThrow(/CHECK/);
    sqlite.exec("delete from grade_category where id = 'g1'");
    expect(sqlite.prepare('select category_id from assignment').get()).toEqual({
      category_id: null,
    });
    upgraded.close();
  });
});
