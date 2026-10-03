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

describe('migration 0002 (tasks)', () => {
  it('adds tasks and timer sessions to a v2 database with data', () => {
    const file = tempFile();
    const v2 = new Database(file);
    migrate(v2, migrations.slice(0, 2));
    v2.exec(`
      insert into course values ('c1', 'Calc', '', '', 'enrolled', 'weighted', '[]', '#6366f1', 'x', 'x');
      insert into assignment values ('a1', 'c1', null, 'HW 1', null, 10, null, 0, 'x', 'x');
    `);
    v2.close();

    const upgraded = openDatabase(file);
    const { sqlite } = upgraded;
    sqlite.exec(`
      insert into task (id, title, course_id, assignment_id, due_at, created_at, updated_at)
        values ('t1', 'Do HW 1', 'c1', 'a1', 'x', 'x', 'x');
      insert into task (id, parent_id, title, due_at, created_at, updated_at)
        values ('t2', 't1', 'Problems 1-5', 'x', 'x', 'x');
      insert into time_session (id, task_id, start_at, end_at)
        values ('s1', 't2', '2026-10-07T15:00:00.000Z', '2026-10-07T15:30:00.000Z');
    `);
    expect(sqlite.prepare('select status, priority, attention, type from task').get()).toEqual({
      status: 'open',
      priority: 'normal',
      attention: 'focus',
      type: '',
    });
    // done ⇔ completed_at, and sessions end after they start.
    expect(() => sqlite.exec("update task set status = 'done' where id = 't1'")).toThrow(/CHECK/);
    expect(() =>
      sqlite.exec(
        "insert into time_session (id, task_id, start_at, end_at) values ('s2', 't1', " +
          "'2026-10-07T15:00:00.000Z', '2026-10-07T14:00:00.000Z')",
      ),
    ).toThrow(/CHECK/);
    // Deleting the assignment unlinks; deleting the parent removes subtasks and sessions.
    sqlite.exec("delete from assignment where id = 'a1'");
    expect(
      sqlite.prepare('select assignment_id, course_id from task where id = ?').get('t1'),
    ).toEqual({ assignment_id: null, course_id: 'c1' });
    sqlite.exec("delete from task where id = 't1'");
    expect(sqlite.prepare('select count(*) as n from time_session').get()).toEqual({ n: 0 });
    upgraded.close();
  });
});

describe('migration 0003 (calendar)', () => {
  it('adds fixed events and blocks to a v3 database with data', () => {
    const file = tempFile();
    const v3 = new Database(file);
    migrate(v3, migrations.slice(0, 3));
    v3.exec(`
      insert into course values ('c1', 'Calc', '', '', 'enrolled', 'weighted', '[]', '#6366f1', 'x', 'x');
      insert into task (id, title, created_at, updated_at) values ('t1', 'Calc HW', 'x', 'x');
    `);
    v3.close();

    const upgraded = openDatabase(file);
    const { sqlite } = upgraded;
    sqlite.exec(`
      insert into fixed_event (id, title, kind, course_id, start_date, start_local, end_local,
          rrule, time_zone, created_at, updated_at)
        values ('e1', 'MATH 2413', 'class', 'c1', '2026-08-24', '10:00', '10:50',
          'FREQ=WEEKLY;BYDAY=MO,WE,FR', 'America/Chicago', 'x', 'x');
      insert into block (id, task_id, start_at, end_at, created_at, updated_at)
        values ('b1', 't1', '2026-10-07T15:00:00.000Z', '2026-10-07T16:00:00.000Z', 'x', 'x');
    `);
    expect(sqlite.prepare('select exceptions, location from fixed_event').get()).toEqual({
      exceptions: '[]',
      location: '',
    });
    expect(sqlite.prepare('select locked, source, title from block').get()).toEqual({
      locked: 0,
      source: 'manual',
      title: '',
    });
    expect(() => sqlite.exec("update fixed_event set kind = 'nap'")).toThrow(/CHECK/);
    expect(() =>
      sqlite.exec("update block set end_at = '2026-10-07T14:00:00.000Z' where id = 'b1'"),
    ).toThrow(/CHECK/);
    // Deleting the course unlinks the class; deleting the task removes its blocks.
    sqlite.exec("delete from course where id = 'c1'");
    expect(sqlite.prepare('select course_id from fixed_event').get()).toEqual({ course_id: null });
    sqlite.exec("delete from task where id = 't1'");
    expect(sqlite.prepare('select count(*) as n from block').get()).toEqual({ n: 0 });
    upgraded.close();
  });
});

describe('migration 0004 (planner)', () => {
  it('gives every task a due date and planner fields, keeping its links', () => {
    const file = tempFile();
    const v4 = new Database(file);
    migrate(v4, migrations.slice(0, 4));
    v4.exec(`
      insert into task (id, title, estimate_min, due_at, created_at, updated_at)
        values ('t1', 'Calc HW', 90, '2026-10-08T04:59:00.000Z', 'x', 'x');
      insert into task (id, parent_id, title, created_at, updated_at)
        values ('t2', 't1', 'Problems 1-5', 'x', 'x');
      insert into task (id, title, status, completed_at, created_at, updated_at)
        values ('t3', 'Old chore', 'done', '2026-09-01T12:00:00.000Z', 'x', 'x');
      insert into time_session (id, task_id, start_at, end_at)
        values ('s1', 't2', '2026-10-07T15:00:00.000Z', '2026-10-07T15:30:00.000Z');
      insert into block (id, task_id, start_at, end_at, created_at, updated_at)
        values ('b1', 't2', '2026-10-07T15:00:00.000Z', '2026-10-07T16:00:00.000Z', 'x', 'x');
    `);
    v4.close();

    const before = Date.now();
    const upgraded = openDatabase(file);
    const { sqlite } = upgraded;
    const rows = sqlite
      .prepare(
        'select id, due_at, deadline, earliest_start_at, splittable, min_chunk_min, steps from task order by id',
      )
      .all() as { id: string; due_at: string }[];
    expect(rows[0]).toEqual({
      id: 't1',
      due_at: '2026-10-08T04:59:00.000Z',
      deadline: 'hard',
      earliest_start_at: null,
      splittable: 1,
      min_chunk_min: 30,
      steps: '[]',
    });
    // An open task without a due date: a soft deadline 7–8 days out, in the stored format.
    expect(rows[1]).toMatchObject({ id: 't2', deadline: 'soft' });
    const due = rows[1]?.due_at ?? '';
    expect(due).toBe(new Date(due).toISOString());
    expect(Date.parse(due) - before).toBeGreaterThan(6 * 86_400_000);
    expect(Date.parse(due) - before).toBeLessThan(8 * 86_400_000);
    // A finished one: its completion time.
    expect(rows[2]).toMatchObject({
      id: 't3',
      due_at: '2026-09-01T12:00:00.000Z',
      deadline: 'soft',
    });
    expect(sqlite.prepare('select kind, source from block').get()).toEqual({
      kind: 'work',
      source: 'manual',
    });
    expect(() => sqlite.exec("update task set deadline = 'firm'")).toThrow(/CHECK/);
    expect(() => sqlite.exec("update task set due_at = null where id = 't1'")).toThrow(/NOT NULL/);
    // Links survive the rebuild: deleting the parent removes the subtask, its session and block.
    sqlite.exec("delete from task where id = 't1'");
    expect(sqlite.prepare('select id from task').all()).toEqual([{ id: 't3' }]);
    expect(sqlite.prepare('select count(*) as n from time_session').get()).toEqual({ n: 0 });
    expect(sqlite.prepare('select count(*) as n from block').get()).toEqual({ n: 0 });
    upgraded.close();
  });
});
