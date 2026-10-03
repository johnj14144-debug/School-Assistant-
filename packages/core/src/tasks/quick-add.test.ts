import { describe, expect, it } from 'vitest';
import { parseQuickAdd, type QuickAddOptions } from './quick-add';

// Wednesday, October 7, 2026.
const options: QuickAddOptions = {
  today: { year: 2026, month: 10, day: 7 },
  courses: [
    { id: 'calc', code: 'MATH 2413', name: 'Calculus I' },
    { id: 'hist', code: 'HIST 4318', name: 'The American West' },
    { id: 'phys', code: 'PHYS 1301', name: 'Physics I' },
  ],
};
const parse = (text: string) => parseQuickAdd(text, options);
const day = (d: number, hour = 23, minute = 59, month = 10) => ({
  year: 2026,
  month,
  day: d,
  hour,
  minute,
});

describe('parseQuickAdd', () => {
  it('reads every kind of shortcut and leaves the rest as the title', () => {
    expect(parse('Calc HW 3 tomorrow 5pm ~90m #math @homework !')).toEqual({
      title: 'Calc HW 3',
      due: day(8, 17, 0),
      estimateMin: 90,
      priority: 'high',
      courseId: 'calc',
      type: 'homework',
      quantity: null,
      unit: null,
      parts: [
        { kind: 'due', text: 'tomorrow 5pm' },
        { kind: 'estimate', text: '~90m' },
        { kind: 'course', text: '#math' },
        { kind: 'type', text: '@homework' },
        { kind: 'priority', text: '!' },
      ],
      warnings: [],
    });
  });

  it('gives a plain title back unchanged', () => {
    const parsed = parse('Email the TA about the lab');
    expect(parsed).toMatchObject({ title: 'Email the TA about the lab', due: null, parts: [] });
    expect(parsed.warnings).toEqual([]);
  });

  it('understands relative days and weekdays', () => {
    expect(parse('x today').due).toEqual(day(7));
    expect(parse('x tonight').due).toEqual(day(7));
    expect(parse('x tmrw').due).toEqual(day(8));
    expect(parse('x fri').due).toEqual(day(9));
    expect(parse('x Friday').due).toEqual(day(9));
    expect(parse('x mon').due).toEqual(day(12));
    // The same weekday as today means next week; "next" adds a week.
    expect(parse('x wed').due).toEqual(day(14));
    expect(parse('x next fri').due).toEqual(day(16));
    expect(parse('x in 3 days').due).toEqual(day(10));
    expect(parse('x in 2 weeks').due).toEqual(day(21));
    expect(parse('x in a week').due).toEqual(day(14));
  });

  it('understands calendar dates with an optional time', () => {
    expect(parse('Essay 10/12').due).toEqual(day(12));
    expect(parse('Essay Oct 12 at 9:30 am').due).toEqual(day(12, 9, 30));
    expect(parse('Essay October 12th, 2026 2pm').due).toEqual(day(12, 14, 0));
    expect(parse('Essay 2026-11-03 14:30').due).toEqual(day(3, 14, 30, 11));
    expect(parse('Essay due 10/12 5 pm').due).toEqual(day(12, 17, 0));
    expect(parse('Final Jan 5').due).toEqual({ ...day(5, 23, 59, 1), year: 2027 });
  });

  it('drops due/by/on before a date but keeps them otherwise', () => {
    expect(parse('Essay, due fri')).toMatchObject({ title: 'Essay', due: day(9) });
    expect(parse('Lab report by mon')).toMatchObject({ title: 'Lab report', due: day(12) });
    expect(parse('Work on essay')).toMatchObject({ title: 'Work on essay', due: null });
    expect(parse('Read about due process')).toMatchObject({ due: null });
  });

  it('treats a time alone as today, wherever it is', () => {
    expect(parse('Call advisor at 3pm').due).toEqual(day(7, 15, 0));
    expect(parse('5pm Call advisor tomorrow')).toMatchObject({
      title: 'Call advisor',
      due: day(8, 17, 0),
    });
  });

  it('never reads all-caps words as weekdays, and keeps quoted text', () => {
    expect(parse('Study for the SAT')).toMatchObject({ title: 'Study for the SAT', due: null });
    expect(parse('"Sun Tzu" reading fri')).toMatchObject({ title: 'Sun Tzu reading', due: day(9) });
    expect(parse('"Do 3/4 of it" ~1h').title).toBe('Do 3/4 of it');
  });

  it('reads estimates in several styles', () => {
    expect(parse('x ~45').estimateMin).toBe(45);
    expect(parse('x ~1.5h').estimateMin).toBe(90);
    expect(parse('x ~1h30').estimateMin).toBe(90);
    expect(parse('x ~1h 15m').estimateMin).toBe(75);
    const bad = parse('x ~soon');
    expect(bad.estimateMin).toBeNull();
    expect(bad.warnings[0]).toMatch(/isn't a duration/);
  });

  it('reads priorities', () => {
    expect(parse('x !high').priority).toBe('high');
    expect(parse('x !!').priority).toBe('high');
    expect(parse('x !low').priority).toBe('low');
    expect(parse('x !n').priority).toBe('normal');
    expect(parse('x').priority).toBeNull();
    expect(parse('Wow!').priority).toBeNull();
  });

  it('matches courses by code or name, and warns when it cannot', () => {
    expect(parse('x #MATH2413').courseId).toBe('calc');
    expect(parse('x #hist').courseId).toBe('hist');
    expect(parse('x #calculus').courseId).toBe('calc');
    expect(parse('x #american').courseId).toBe('hist');
    const ambiguous = parse('x #ph #p');
    expect(ambiguous.courseId).toBe('phys');
    const none = parse('Problem #1 #chem');
    expect(none.courseId).toBeNull();
    expect(none.title).toBe('Problem #1 #chem');
    expect(none.warnings).toEqual(['No course matches #chem']);
    const many = parseQuickAdd('x #math', {
      ...options,
      courses: [...options.courses, { id: 'calc2', code: 'MATH 2414', name: 'Calculus II' }],
    });
    expect(many.courseId).toBeNull();
    expect(many.warnings[0]).toMatch(/could be MATH 2413, MATH 2414/);
  });

  it('reads types, turning dashes into spaces', () => {
    expect(parse('x @Reading').type).toBe('reading');
    expect(parse('x @exam-prep').type).toBe('exam prep');
  });

  it('reads a quantity and keeps it in the title', () => {
    expect(parse('Do 12 problems fri')).toMatchObject({
      title: 'Do 12 problems',
      quantity: 12,
      unit: 'problems',
      due: day(9),
    });
    expect(parse('Read pages 45-60')).toMatchObject({ quantity: 16, unit: 'pages' });
    expect(parse('Read pp. 45–60')).toMatchObject({ quantity: 16, unit: 'pages' });
    expect(parse('Read 1 chapter')).toMatchObject({ quantity: 1, unit: 'chapters' });
    expect(parse('Read chapter 3')).toMatchObject({ quantity: null, unit: null });
    expect(parse('Problems 1-12 in 3 days')).toMatchObject({
      quantity: 12,
      due: day(10),
      title: 'Problems 1-12',
    });
  });

  it('warns when nothing is left for the title', () => {
    expect(parse('tomorrow ~1h').warnings).toEqual(['Type a title']);
    expect(parse('').warnings).toEqual(['Type a title']);
  });

  it('copes with a quote still being typed', () => {
    expect(parse('"Sun Tzu fri').title).toBe('Sun Tzu fri');
  });
});
