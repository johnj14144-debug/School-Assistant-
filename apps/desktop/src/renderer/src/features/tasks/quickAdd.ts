import {
  defaultDue,
  parseQuickAdd,
  type QuickAdd,
  type QuickAddCourse,
  type TaskCreate,
} from '@sa/core';
import { formatTaskDue, isoFromLocal, todayLocal } from '../../lib/dates';

/** Parses a quick-add line against the user's courses, with today's local date. */
export function parseLine(text: string, courses: readonly QuickAddCourse[], now = new Date()) {
  return parseQuickAdd(text, { today: todayLocal(now), courses });
}

/**
 * The task to create from a parsed line. Fields that weren't typed are left out, so a subtask
 * still takes its parent's course, type and due date, and any other task gets the default soft
 * deadline (main's `TasksService.create`).
 */
export function createInput(parsed: QuickAdd, extra: Partial<TaskCreate> = {}): TaskCreate {
  return {
    title: parsed.title,
    ...(parsed.due ? { dueAt: isoFromLocal(parsed.due) } : {}),
    estimateMin: parsed.estimateMin,
    quantity: parsed.quantity,
    unit: parsed.unit ?? '',
    ...(parsed.priority ? { priority: parsed.priority } : {}),
    ...(parsed.courseId ? { courseId: parsed.courseId } : {}),
    ...(parsed.type ? { type: parsed.type } : {}),
    ...extra,
  };
}

/**
 * What a line without a due date gets (main fills it in): its parent's due date for a subtask,
 * else a soft deadline tonight (Today list) or a week from today.
 */
export function defaultDueLabel(extra: Partial<TaskCreate>, now = new Date()): string {
  if (extra.parentId) return 'Due with its parent';
  const due = isoFromLocal(defaultDue(todayLocal(now), extra.today === true));
  return `Soft deadline ${formatTaskDue(due, now)}`;
}
