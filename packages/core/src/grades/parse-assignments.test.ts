import { describe, expect, it } from 'vitest';
import { type ParseAssignmentOptions, parseAssignmentLines } from './parse-assignments';

const options: ParseAssignmentOptions = {
  today: { year: 2026, month: 10, day: 2 },
  categoryNames: ['Homework', 'Quizzes', 'Video Quizzes'],
};

function one(line: string, opts = options) {
  const [parsed] = parseAssignmentLines(line, opts);
  if (!parsed) throw new Error('nothing parsed');
  return parsed;
}

describe('parseAssignmentLines', () => {
  it('reads title, date and points', () => {
    expect(one('HW 1, 10/7, 20 pts')).toEqual({
      line: 1,
      title: 'HW 1',
      due: { year: 2026, month: 10, day: 7, hour: 23, minute: 59 },
      pointsPossible: 20,
      pointsEarned: null,
      extraCredit: false,
      categoryName: null,
      errors: [],
    });
  });

  it('accepts other separators, date styles and point styles', () => {
    expect(one('Midterm; 10/6/2026; 100').due).toMatchObject({ year: 2026, month: 10, day: 6 });
    expect(one('Essay | 2026-11-03 | 100 points').due).toMatchObject({ month: 11, day: 3 });
    expect(one('Final\tDec 14\t100').due).toMatchObject({ year: 2026, month: 12, day: 14 });
    expect(one('Quiz, Sept 9, 10pts').due).toMatchObject({ month: 9, day: 9 });
    expect(one('Quiz, October 9th, 2026, 10 pts').due).toMatchObject({ month: 10, day: 9 });
    expect(one('Quiz, due 10/9/26, 10 pt').due).toMatchObject({ year: 2026, month: 10, day: 9 });
  });

  it('reads a due time in the date field or on its own', () => {
    expect(one('Quiz 2, Oct 14 2pm, 10').due).toMatchObject({ day: 14, hour: 14, minute: 0 });
    expect(one('Quiz 2, 10/14 at 9:30 am, 10').due).toMatchObject({ hour: 9, minute: 30 });
    expect(one('Quiz 2, 10/14, 12pm, 10').due).toMatchObject({ hour: 12, minute: 0 });
    expect(one('Quiz 2, 10/14, 12:15am, 10').due).toMatchObject({ hour: 0, minute: 15 });
    expect(one('Quiz 2, 10/14 14:30, 10').due).toMatchObject({ hour: 14, minute: 30 });
  });

  it('reads a graded score as earned/possible', () => {
    const parsed = one('Quiz 1, 9/1, 8/10 pts');
    expect(parsed).toMatchObject({ pointsEarned: 8, pointsPossible: 10, errors: [] });
    expect(parsed.due).toMatchObject({ month: 9, day: 1 });
    expect(one('HW 2, 18/20').pointsEarned).toBe(18);
    expect(one('HW 3, 9/30, 9.5 / 10').pointsEarned).toBe(9.5);
  });

  it('treats a bare a/b as the date when the line has none', () => {
    const parsed = one('Quiz 1, 8/10');
    expect(parsed.due).toMatchObject({ month: 8, day: 10 });
    expect(parsed.errors).toContain('Missing the points (e.g. "20 pts")');
  });

  it('matches category names and extra credit, in any order', () => {
    expect(one('Quiz 3, video quizzes, 10, 10/20')).toMatchObject({
      categoryName: 'Video Quizzes',
      pointsPossible: 10,
      due: { month: 10, day: 20 },
    });
    expect(one('Presentation, 5 pts, extra credit').extraCredit).toBe(true);
    expect(one('Bonus quiz, EC, 3').extraCredit).toBe(true);
  });

  it('allows no date', () => {
    expect(one('Participation, 10 pts')).toMatchObject({ due: null, errors: [] });
  });

  it('picks the year closest to today', () => {
    const december = { ...options, today: { year: 2026, month: 12, day: 15 } };
    expect(one('Spring HW 1, 1/20, 10', december).due).toMatchObject({ year: 2027 });
    const january = { ...options, today: { year: 2027, month: 1, day: 10 } };
    expect(one('Old quiz, 12/1, 10', january).due).toMatchObject({ year: 2026 });
  });

  it('reports what it could not read', () => {
    expect(one('HW 1, 2/30/2026, 10').errors).toEqual(['Didn\'t understand "2/30/2026"']);
    // Not a date, so "2/30" is a score: 2 out of 30.
    expect(one('HW 1, 2/30')).toMatchObject({ pointsEarned: 2, pointsPossible: 30, due: null });
    expect(one('HW 1, Octopus 7, 10').errors).toEqual(['Didn\'t understand "Octopus 7"']);
    expect(one('HW 1, 10/7, 20 pts, soon').errors).toEqual(['Didn\'t understand "soon"']);
    expect(one('HW 1, 2pm, 10').errors).toEqual(['A time was given without a date']);
    expect(one(', 10/7, 20').errors).toContain('Missing a title');
  });

  it('skips blank lines and keeps line numbers', () => {
    const parsed = parseAssignmentLines('\nHW 1, 10\n\n  \nHW 2, 10\r\n', options);
    expect(parsed.map((p) => [p.line, p.title])).toEqual([
      [2, 'HW 1'],
      [5, 'HW 2'],
    ]);
  });
});
