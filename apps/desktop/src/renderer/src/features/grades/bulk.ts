import type { AssignmentCreate, GradeCategory, ParsedAssignmentLine, SeriesItem } from '@sa/core';
import { isoFromLocal } from '../../lib/dates';

/** Turns parsed pasted lines (all without errors) into assignments for `assignment:create-many`. */
export function pastedToInputs(
  lines: ParsedAssignmentLine[],
  context: { courseId: string; categories: GradeCategory[]; defaultCategoryId: string | null },
): AssignmentCreate[] {
  const byName = new Map(context.categories.map((c) => [c.name, c.id]));
  return lines.map((line) => ({
    courseId: context.courseId,
    title: line.title,
    categoryId:
      line.categoryName === null
        ? context.defaultCategoryId
        : (byName.get(line.categoryName) ?? context.defaultCategoryId),
    dueAt: line.due ? isoFromLocal(line.due) : null,
    pointsPossible: line.pointsPossible ?? 0,
    pointsEarned: line.pointsEarned,
    extraCredit: line.extraCredit,
  }));
}

/** Turns a numbered series into assignments for `assignment:create-many`. */
export function seriesToInputs(
  items: SeriesItem[],
  context: { courseId: string; categoryId: string | null; pointsPossible: number },
): AssignmentCreate[] {
  return items.map((item) => ({
    courseId: context.courseId,
    title: item.title,
    categoryId: context.categoryId,
    dueAt: item.due ? isoFromLocal(item.due) : null,
    pointsPossible: context.pointsPossible,
  }));
}
