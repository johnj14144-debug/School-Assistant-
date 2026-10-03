import { parseQuickAdd, type QuickAdd, type QuickAddCourse, type TaskCreate } from '@sa/core';
import { isoFromLocal, todayLocal } from '../../lib/dates';

/** Parses a quick-add line against the user's courses, with today's local date. */
export function parseLine(text: string, courses: readonly QuickAddCourse[], now = new Date()) {
  return parseQuickAdd(text, { today: todayLocal(now), courses });
}

/**
 * The task to create from a parsed line. Fields that weren't typed are left out, so a subtask
 * still takes its parent's course and type.
 */
export function createInput(parsed: QuickAdd, extra: Partial<TaskCreate> = {}): TaskCreate {
  return {
    title: parsed.title,
    dueAt: parsed.due ? isoFromLocal(parsed.due) : null,
    estimateMin: parsed.estimateMin,
    quantity: parsed.quantity,
    unit: parsed.unit ?? '',
    ...(parsed.priority ? { priority: parsed.priority } : {}),
    ...(parsed.courseId ? { courseId: parsed.courseId } : {}),
    ...(parsed.type ? { type: parsed.type } : {}),
    ...extra,
  };
}
