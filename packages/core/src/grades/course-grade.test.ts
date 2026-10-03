import { describe, expect, it } from 'vitest';
import {
  type CourseGradeInput,
  courseGrade,
  type GradeCategoryInput,
  type GradeItem,
} from './course-grade';

let nextId = 0;
function item(
  categoryId: string | null,
  pointsPossible: number,
  pointsEarned: number | null,
  extraCredit = false,
): GradeItem {
  nextId += 1;
  return { id: `a${nextId}`, categoryId, pointsPossible, pointsEarned, extraCredit };
}

function cat(id: string, weight: number, dropLowest = 0): GradeCategoryInput {
  return { id, weight, dropLowest };
}

/** A category whose points go straight onto the final grade, up to `cap`. */
function bonusCat(id: string, cap: number): GradeCategoryInput {
  return { id, weight: cap, dropLowest: 0, kind: 'bonus' };
}

function weighted(categories: GradeCategoryInput[], assignments: GradeItem[]): CourseGradeInput {
  return { grading: 'weighted', categories, assignments };
}

function points(assignments: GradeItem[], categories: GradeCategoryInput[] = []): CourseGradeInput {
  return { grading: 'points', categories, assignments };
}

describe('courseGrade: no grades yet', () => {
  it('has no current grade and the full 0–100 range for an empty weighted course', () => {
    const result = courseGrade(weighted([cat('hw', 40), cat('exams', 60)], []));
    expect(result.current).toBeNull();
    expect(result.max).toBe(100);
    expect(result.min).toBe(0);
  });

  it('has no current grade when assignments exist but none is graded', () => {
    const result = courseGrade(points([item(null, 100, null), item(null, 50, null)]));
    expect(result.current).toBeNull();
    expect(result.max).toBe(100);
    expect(result.min).toBe(0);
  });

  it('has no current grade for a course with nothing in it', () => {
    const result = courseGrade(points([]));
    expect(result).toMatchObject({ current: null, max: 100, min: 0, warnings: [] });
  });
});

describe('courseGrade: points-based', () => {
  it('divides total earned by total possible over graded work', () => {
    const result = courseGrade(
      points([item(null, 100, 90), item(null, 50, 40), item(null, 50, null)]),
    );
    expect(result.current).toBeCloseTo((130 / 150) * 100, 10);
  });

  it('projects max with 100% and min with 0% on everything ungraded', () => {
    const result = courseGrade(points([item(null, 100, 80), item(null, 100, null)]));
    expect(result.current).toBe(80);
    expect(result.max).toBe(90);
    expect(result.min).toBe(40);
  });

  it('ignores category weights', () => {
    const result = courseGrade(
      points([item('a', 10, 10), item('b', 90, 45)], [cat('a', 90), cat('b', 10)]),
    );
    expect(result.current).toBe(55);
  });
});

describe('courseGrade: weighted categories', () => {
  it('weights category percents', () => {
    const result = courseGrade(
      weighted(
        [cat('hw', 40), cat('exams', 60)],
        [item('hw', 10, 9), item('hw', 10, 10), item('exams', 100, 80)],
      ),
    );
    // HW 95%, exams 80% → 0.4 × 95 + 0.6 × 80 = 86
    expect(result.current).toBe(86);
    expect(result.categories.map((c) => c.current)).toEqual([95, 80]);
  });

  it('pools points within a category (not an average of percents)', () => {
    const result = courseGrade(
      weighted([cat('hw', 100)], [item('hw', 10, 10), item('hw', 90, 45)]),
    );
    expect(result.current).toBe(55);
  });

  it('bases the current grade on graded categories only', () => {
    const result = courseGrade(
      weighted([cat('hw', 30), cat('final', 70)], [item('hw', 20, 18), item('final', 100, null)]),
    );
    expect(result.current).toBe(90);
    expect(result.categories[1]?.current).toBeNull();
  });

  it('treats a category with nothing entered as fully open for max and min', () => {
    const result = courseGrade(weighted([cat('hw', 30), cat('final', 70)], [item('hw', 20, 18)]));
    // HW is 90% and settled; the final could be anything from 0 to 100.
    expect(result.max).toBe(97);
    expect(result.min).toBe(27);
  });

  it('projects ungraded work inside categories', () => {
    const result = courseGrade(
      weighted(
        [cat('hw', 50), cat('exams', 50)],
        [item('hw', 10, 5), item('hw', 10, null), item('exams', 100, 70), item('exams', 100, null)],
      ),
    );
    // max: hw 15/20 = 75, exams 170/200 = 85 → 80; min: hw 5/20 = 25, exams 70/200 = 35 → 30
    expect(result.max).toBe(80);
    expect(result.min).toBe(30);
  });

  it('renormalizes and warns when weights do not sum to 100', () => {
    const result = courseGrade(
      weighted([cat('hw', 30), cat('exams', 60)], [item('hw', 10, 10), item('exams', 10, 7)]),
    );
    expect(result.current).toBeCloseTo((30 * 100 + 60 * 70) / 90, 10);
    expect(result.warnings).toContainEqual({ code: 'weights_not_100', total: 90 });
  });

  it('does not warn when weights sum to 100', () => {
    const result = courseGrade(
      weighted([cat('a', 33.3), cat('b', 33.3), cat('c', 33.4)], [item('a', 1, 1)]),
    );
    expect(result.warnings).toEqual([]);
  });

  it('ignores and reports uncategorized assignments', () => {
    const result = courseGrade(
      weighted([cat('hw', 100)], [item('hw', 10, 8), item(null, 10, 0), item('gone', 10, 0)]),
    );
    expect(result.current).toBe(80);
    expect(result.warnings).toContainEqual({ code: 'uncategorized_ignored', count: 2 });
  });

  it('skips zero-weight categories without dividing by zero', () => {
    const result = courseGrade(weighted([cat('practice', 0)], [item('practice', 10, 5)]));
    expect(result.current).toBeNull();
    expect(result.max).toBe(100);
    expect(result.min).toBe(0);
  });
});

describe('courseGrade: drop lowest', () => {
  it('drops the lowest score in the category', () => {
    const result = courseGrade(
      weighted(
        [cat('quiz', 100, 1)],
        [item('quiz', 10, 4), item('quiz', 10, 9), item('quiz', 10, 8)],
      ),
    );
    expect(result.current).toBe(85);
    expect(result.dropped).toHaveLength(1);
    expect(result.categories[0]?.dropped).toEqual(result.dropped);
  });

  it('drops whatever raises the category most, not just the lowest percent', () => {
    // Dropping the 0/1 (the lowest percent) leaves 148/200 = 74%; dropping the 50/100 leaves
    // 98/101 ≈ 97%. The drop must favor the student.
    const big = item('hw', 100, 50);
    const result = courseGrade(
      weighted([cat('hw', 100, 1)], [item('hw', 1, 0), big, item('hw', 100, 98)]),
    );
    expect(result.dropped).toEqual([big.id]);
    expect(result.current).toBeCloseTo((98 * 100) / 101, 10);
  });

  it('always keeps at least one graded assignment', () => {
    const result = courseGrade(
      weighted([cat('quiz', 100, 3)], [item('quiz', 10, 6), item('quiz', 10, 2)]),
    );
    expect(result.current).toBe(60);
    expect(result.dropped).toHaveLength(1);
  });

  it('drops among graded work for the current grade only', () => {
    const result = courseGrade(
      weighted([cat('quiz', 100, 1)], [item('quiz', 10, 5), item('quiz', 10, null)]),
    );
    // Only one graded quiz, so nothing is dropped yet.
    expect(result.current).toBe(50);
    expect(result.dropped).toEqual([]);
    // Best case: the open quiz is 10/10 and the 5/10 is dropped. Worst case: the open quiz
    // is 0/10 and gets dropped instead.
    expect(result.max).toBe(100);
    expect(result.min).toBe(50);
  });

  it('applies drops in points-based courses too', () => {
    const result = courseGrade(
      points([item('quiz', 10, 2), item('quiz', 10, 10), item(null, 80, 60)], [cat('quiz', 0, 1)]),
    );
    expect(result.current).toBeCloseTo((70 * 100) / 90, 10);
  });

  it('never drops extra credit', () => {
    const bonus = item('hw', 5, 0, true);
    const result = courseGrade(
      weighted([cat('hw', 100, 1)], [item('hw', 10, 7), item('hw', 10, 9), bonus]),
    );
    expect(result.dropped).not.toContain(bonus.id);
    expect(result.current).toBe(90);
  });

  it('breaks ties deterministically', () => {
    const items = [item('quiz', 10, 5), item('quiz', 10, 5), item('quiz', 10, 5)];
    const a = courseGrade(weighted([cat('quiz', 100, 1)], items));
    const b = courseGrade(weighted([cat('quiz', 100, 1)], [...items].reverse()));
    expect(a.dropped).toEqual(b.dropped);
  });
});

describe('courseGrade: extra credit', () => {
  it('allows more points than possible', () => {
    const result = courseGrade(points([item(null, 50, 55)]));
    expect(result.current).toBe(110);
  });

  it('adds extra-credit points without adding to the possible total', () => {
    const result = courseGrade(points([item(null, 100, 80), item(null, 5, 5, true)]));
    expect(result.current).toBe(85);
  });

  it('adds extra credit inside its category in weighted courses', () => {
    const result = courseGrade(
      weighted(
        [cat('hw', 50), cat('exams', 50)],
        [item('hw', 100, 90), item('hw', 10, 10, true), item('exams', 100, 80)],
      ),
    );
    expect(result.current).toBe(90); // HW 100%, exams 80%
  });

  it('counts ungraded extra credit in the max but not the min', () => {
    const result = courseGrade(points([item(null, 100, 80), item(null, 5, null, true)]));
    expect(result.max).toBe(85);
    expect(result.min).toBe(80);
    expect(result.current).toBe(80);
  });

  it('can push the max above 100', () => {
    const result = courseGrade(points([item(null, 100, null), item(null, 10, null, true)]));
    expect(result.max).toBe(110);
  });
});

describe('courseGrade: bonus categories (points onto the final grade)', () => {
  it('adds earned points straight onto the final percent', () => {
    const result = courseGrade(
      weighted([cat('exams', 100), bonusCat('ec', 5)], [item('exams', 100, 80), item('ec', 5, 3)]),
    );
    expect(result.current).toBe(83);
    expect(result.max).toBe(83);
    expect(result.min).toBe(83);
  });

  it('caps the bonus at the category weight', () => {
    const result = courseGrade(
      weighted(
        [cat('exams', 100), bonusCat('ec', 5)],
        [item('exams', 100, 90), item('ec', 5, 5), item('ec', 5, 4), item('ec', 3, null)],
      ),
    );
    expect(result.current).toBe(95);
    expect(result.max).toBe(95);
    expect(result.categories.find((c) => c.categoryId === 'ec')).toMatchObject({
      kind: 'bonus',
      current: 5,
      max: 5,
      min: 5,
    });
  });

  it('counts ungraded bonus work in the max only', () => {
    const result = courseGrade(
      weighted(
        [cat('exams', 100), bonusCat('ec', 5)],
        [item('exams', 100, 80), item('ec', 5, null)],
      ),
    );
    expect(result.current).toBe(80);
    expect(result.max).toBe(85);
    expect(result.min).toBe(80);
    expect(result.categories[1]?.current).toBeNull();
  });

  it('is left out of the weight total, and fully open while empty', () => {
    const result = courseGrade(weighted([cat('exams', 100), bonusCat('ec', 5)], []));
    expect(result.warnings).toEqual([]);
    expect(result.max).toBe(105);
  });

  it('does not create a current grade on its own', () => {
    const result = courseGrade(
      weighted(
        [cat('exams', 100), bonusCat('ec', 5)],
        [item('exams', 100, null), item('ec', 5, 5)],
      ),
    );
    expect(result.current).toBeNull();
  });

  it('works in points-based courses', () => {
    const result = courseGrade(
      points([item(null, 200, 150), item('ec', 2, 2)], [bonusCat('ec', 3)]),
    );
    expect(result.current).toBe(77);
  });
});

describe('courseGrade: real syllabus (HIST 4318, Fall 2026)', () => {
  // Grading from the syllabus: attendance 10%, 8 video quizzes 16%, 13 reading responses 20%
  // (lowest 3 dropped), midterm 20%, in-class essay 14%, final 20%, and up to 5 points of extra
  // credit added to the final grade. Scores are made up, as of week 6.
  const categories = [
    cat('attendance', 10),
    cat('video', 16),
    cat('rrq', 20, 3),
    cat('midterm', 20),
    cat('essay', 14),
    cat('final', 20),
    bonusCat('extra', 5),
  ];
  const videoScores = [10, 9, 8, 10, 7, null, null, null];
  const rrqScores = [10, 8, 0, 9, 10, 7, null, null, null, null, null, null, null];
  const assignments = [
    item('attendance', 10, null),
    ...videoScores.map((score) => item('video', 10, score)),
    ...rrqScores.map((score) => item('rrq', 10, score)),
    item('midterm', 100, null),
    item('essay', 100, null),
    item('final', 100, null),
    item('extra', 5, null),
    item('extra', 5, null),
    item('extra', 3, null),
  ];
  const result = courseGrade(weighted(categories, assignments));

  it('computes the current grade from graded categories, dropping the 3 worst responses', () => {
    // Video quizzes 44/50 = 88%; responses keep 10, 9, 10 → 29/30.
    expect(result.current).toBeCloseTo((16 * 88 + 20 * ((29 * 100) / 30)) / 36, 9);
    expect(result.dropped).toHaveLength(3);
  });

  it('computes the best and worst final grades still possible', () => {
    // Best: video 74/80, responses 99/100 after drops, everything else 100%, plus 5 bonus.
    expect(result.max).toBeCloseTo(98.6 + 5, 9);
    // Worst: video 44/80, responses 44/100 after dropping three zeros, everything else 0.
    expect(result.min).toBeCloseTo(17.6, 9);
    expect(result.warnings).toEqual([]);
  });
});

describe('courseGrade: precision', () => {
  it('keeps exact cutoffs exact', () => {
    // 0.4 × 95 + 0.6 × 91.666… is 93 in exact arithmetic.
    const result = courseGrade(
      weighted([cat('hw', 40), cat('exams', 60)], [item('hw', 20, 19), item('exams', 300, 275)]),
    );
    expect(result.current).toBe(93);
  });
});

describe('courseGrade: drop choice is optimal', () => {
  /** Small seeded PRNG so failures reproduce. */
  function mulberry32(seed: number) {
    let a = seed;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function bestByBruteForce(scores: { earned: number; possible: number }[], drop: number): number {
    const keep = scores.length - Math.min(drop, scores.length - 1);
    let best = Number.NEGATIVE_INFINITY;
    for (let mask = 0; mask < 1 << scores.length; mask += 1) {
      let bits = 0;
      let earned = 0;
      let possible = 0;
      scores.forEach((s, i) => {
        if (mask & (1 << i)) {
          bits += 1;
          earned += s.earned;
          possible += s.possible;
        }
      });
      if (bits === keep) best = Math.max(best, (earned * 100) / possible);
    }
    return best;
  }

  it('matches exhaustive search on random categories', () => {
    const random = mulberry32(42);
    for (let run = 0; run < 300; run += 1) {
      const n = 1 + Math.floor(random() * 7);
      const drop = Math.floor(random() * 4);
      const scores = Array.from({ length: n }, () => {
        const possible = 1 + Math.floor(random() * 100);
        return { possible, earned: Math.floor(random() * (possible + 1)) };
      });
      const result = courseGrade(
        weighted(
          [cat('c', 100, drop)],
          scores.map((s) => item('c', s.possible, s.earned)),
        ),
      );
      expect(result.current).toBeCloseTo(bestByBruteForce(scores, drop), 8);
    }
  });
});
