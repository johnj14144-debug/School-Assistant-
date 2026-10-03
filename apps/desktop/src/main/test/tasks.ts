import {
  assignmentCreateSchema,
  courseCreateSchema,
  taskCompleteSchema,
  taskCreateSchema,
  taskUpdateSchema,
} from '@sa/core';
import { vi } from 'vitest';
import { openDatabase } from '../db/database';
import { SettingsService } from '../db/settings';
import { GradesService } from '../features/grades/service';
import { TasksService } from '../features/tasks/service';
import { TimerService } from '../features/tasks/timer';
import { fakeClock, stubLogger } from './helpers';

// Day boundaries follow the laptop's zone; task tests run in Houston time.
process.env.TZ = 'America/Chicago';

/** Task and timer services on a fresh database (or `file`), with a controllable clock. */
export function setupTasks(start = '2026-10-07T15:00:00.000Z', file = ':memory:') {
  const clock = fakeClock(start);
  const database = openDatabase(file);
  const settings = new SettingsService(database.db, stubLogger(), clock.now);
  const onChange = vi.fn();
  const tasks = new TasksService({ db: database.db, settings, now: clock.now, onChange });
  const timer = new TimerService({ db: database.db, settings, tasks, now: clock.now, onChange });
  const grades = new GradesService({ db: database.db, now: clock.now });
  // Inputs go through the IPC schemas, so defaults apply as in the app.
  const task = (title: string, extra: object = {}) =>
    tasks.create(taskCreateSchema.parse({ title, ...extra }));
  const update = (id: string, patch: object) =>
    tasks.update(taskUpdateSchema.parse({ id, ...patch }));
  const complete = (id: string, note = '') =>
    tasks.complete(taskCompleteSchema.parse({ id, note }));
  const course = (name: string, code = '') =>
    grades.createCourse(courseCreateSchema.parse({ name, code }));
  const assignment = (courseId: string, title: string) =>
    grades.createAssignment(assignmentCreateSchema.parse({ courseId, title, pointsPossible: 10 }));
  return {
    clock,
    database,
    settings,
    tasks,
    timer,
    onChange,
    task,
    update,
    complete,
    course,
    assignment,
  };
}
