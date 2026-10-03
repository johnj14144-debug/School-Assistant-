import { type GradeCategory, numberedSeries, parseAssignmentLines } from '@sa/core';
import { beforeAll, describe, expect, it } from 'vitest';

beforeAll(() => {
  // Houston. Node re-reads TZ when it changes.
  process.env.TZ = 'America/Chicago';
});

const { pastedToInputs, seriesToInputs } = await import('./bulk');

const courseId = '00000000-0000-4000-8000-000000000001';
const category = (id: string, name: string): GradeCategory => ({
  id,
  courseId,
  name,
  kind: 'regular',
  weight: 20,
  dropLowest: 0,
  position: 0,
});
const quizzes = category('00000000-0000-4000-8000-0000000000a1', 'Quizzes');
const homework = category('00000000-0000-4000-8000-0000000000a2', 'Homework');

describe('bulk add inputs', () => {
  it('maps pasted lines to assignments, with the default category for lines without one', () => {
    const lines = parseAssignmentLines(
      'HW 1, 10/7, 20 pts\nQuiz 2; quizzes; Oct 14 2pm; 8/10 pts',
      {
        today: { year: 2026, month: 10, day: 2 },
        categoryNames: [quizzes.name, homework.name],
      },
    );
    expect(
      pastedToInputs(lines, {
        courseId,
        categories: [quizzes, homework],
        defaultCategoryId: homework.id,
      }),
    ).toEqual([
      {
        courseId,
        title: 'HW 1',
        categoryId: homework.id,
        dueAt: '2026-10-08T04:59:00.000Z',
        pointsPossible: 20,
        pointsEarned: null,
        extraCredit: false,
      },
      {
        courseId,
        title: 'Quiz 2',
        categoryId: quizzes.id,
        dueAt: '2026-10-14T19:00:00.000Z',
        pointsPossible: 10,
        pointsEarned: 8,
        extraCredit: false,
      },
    ]);
  });

  it('keeps a weekly series at 11:59 pm local across the change from daylight time', () => {
    const items = numberedSeries({
      name: 'Video Quiz',
      count: 2,
      firstDue: { year: 2026, month: 10, day: 26 },
      everyDays: 7,
    });
    const inputs = seriesToInputs(items, { courseId, categoryId: quizzes.id, pointsPossible: 10 });
    expect(inputs.map((i) => i.dueAt)).toEqual([
      '2026-10-27T04:59:00.000Z',
      '2026-11-03T05:59:00.000Z',
    ]);
    expect(inputs[1]).toMatchObject({
      title: 'Video Quiz 2',
      categoryId: quizzes.id,
      pointsPossible: 10,
    });
  });
});
