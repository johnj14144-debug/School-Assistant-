import { z } from 'zod';

/**
 * Course grade math for Grade Calc.
 *
 * - **Weighted** courses: each category's percent is its pooled points (earned / possible), and
 *   the course grade is the weight-averaged category percent. **Points** courses pool every
 *   assignment and ignore weights.
 * - **Current** grade uses graded work only (weights renormalized over graded categories).
 *   **Max** assumes 100% on everything ungraded and **min** assumes 0%. A weighted category with
 *   nothing entered yet counts as fully open: 100% for max, 0% for min.
 * - **Drop lowest** removes, per category, the scores whose removal raises that category the
 *   most (not simply the lowest percents), and always keeps at least one score.
 * - **Extra credit**: earned points above possible count, and an `extraCredit` assignment adds
 *   its earned points without adding its possible points. It is never dropped. Ungraded extra
 *   credit counts at full value in the max and not at all in the min.
 * - **Bonus categories** ("5 points of extra credit can be added to your final grade"): their
 *   earned points are added straight onto the final percent, one point per percentage point, up
 *   to the category's weight (the cap). They don't count toward the 100% of weights.
 */

export const gradingTypeSchema = z.enum(['weighted', 'points']);
export type GradingType = z.infer<typeof gradingTypeSchema>;

export const categoryKindSchema = z.enum(['regular', 'bonus']);
export type CategoryKind = z.infer<typeof categoryKindSchema>;

export interface GradeCategoryInput {
  id: string;
  /**
   * Percent of the course grade (weighted courses only). For a bonus category: the most
   * percentage points it can add to the final grade.
   */
  weight: number;
  dropLowest: number;
  /** Defaults to 'regular'. */
  kind?: CategoryKind;
}

export interface GradeItem {
  id: string;
  categoryId: string | null;
  pointsPossible: number;
  /** null until graded. */
  pointsEarned: number | null;
  extraCredit: boolean;
}

export interface CourseGradeInput {
  grading: GradingType;
  categories: GradeCategoryInput[];
  assignments: GradeItem[];
}

export const gradeWarningSchema = z.discriminatedUnion('code', [
  z.object({ code: z.literal('weights_not_100'), total: z.number() }),
  z.object({ code: z.literal('uncategorized_ignored'), count: z.number().int() }),
]);
export type GradeWarning = z.infer<typeof gradeWarningSchema>;

export const categoryGradeSchema = z.object({
  categoryId: z.string(),
  kind: categoryKindSchema,
  weight: z.number(),
  /**
   * Percent over graded work, or null when nothing in the category is graded. For a bonus
   * category, current/max/min are the percentage points it adds to the final grade.
   */
  current: z.number().nullable(),
  max: z.number(),
  min: z.number(),
  /** Assignments dropped from the current grade. */
  dropped: z.array(z.string()),
});
export type CategoryGrade = z.infer<typeof categoryGradeSchema>;

export const courseGradeSchema = z.object({
  /** Percent over graded work, or null when nothing is graded yet. */
  current: z.number().nullable(),
  /** Best final percent still possible (100% on everything ungraded). */
  max: z.number(),
  /** Worst final percent still possible (0% on everything ungraded). */
  min: z.number(),
  categories: z.array(categoryGradeSchema),
  /** Assignments dropped from the current grade, across all categories. */
  dropped: z.array(z.string()),
  warnings: z.array(gradeWarningSchema),
});
export type CourseGrade = z.infer<typeof courseGradeSchema>;

type Scenario = 'current' | 'max' | 'min';

interface Score {
  id: string;
  earned: number;
  possible: number;
}

interface Pool {
  earned: number;
  possible: number;
  dropped: string[];
}

/** Floating-point noise (93.00000000000001) must not cost a letter at a cutoff. */
function clean(value: number): number {
  return Math.round(value * 1e10) / 1e10;
}

function ratioPercent(earned: number, possible: number): number | null {
  return possible > 0 ? clean((earned * 100) / possible) : null;
}

function byId(a: Score, b: Score): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Picks which `drop` scores to remove so (earned + bonus) / possible of the rest is as high as
 * possible. Dinkelbach's method: for a guess q, the best set maximizes Σ(earned − q·possible),
 * which is a sort; repeat with q = that set's ratio until it stops improving. Exact, and it
 * converges in a few rounds.
 */
function chooseDrops(scores: Score[], drop: number, bonus: number): Set<string> {
  const count = Math.min(drop, scores.length - 1);
  if (count <= 0) return new Set();
  const keepCount = scores.length - count;
  const ordered = [...scores].sort(byId);
  let q = Number.NEGATIVE_INFINITY;
  let keep: Score[] = [];
  for (let round = 0; round <= scores.length + 1; round += 1) {
    const guess = Number.isFinite(q) ? q : 0;
    const ranked = [...ordered].sort(
      (a, b) => b.earned - guess * b.possible - (a.earned - guess * a.possible) || byId(a, b),
    );
    const candidate = ranked.slice(0, keepCount);
    const earned = candidate.reduce((sum, s) => sum + s.earned, bonus);
    const possible = candidate.reduce((sum, s) => sum + s.possible, 0);
    const next = earned / possible;
    if (next <= q + 1e-12) break;
    q = next;
    keep = candidate;
  }
  const kept = new Set(keep.map((s) => s.id));
  return new Set(ordered.filter((s) => !kept.has(s.id)).map((s) => s.id));
}

/** Pools one group of assignments for a scenario, applying the drop rule. */
function pool(items: GradeItem[], dropLowest: number, scenario: Scenario): Pool {
  let bonus = 0;
  const scores: Score[] = [];
  for (const a of items) {
    const graded = a.pointsEarned !== null;
    if (scenario === 'current' && !graded) continue;
    const earned = a.pointsEarned ?? (scenario === 'max' ? a.pointsPossible : 0);
    if (a.extraCredit || a.pointsPossible <= 0) {
      bonus += earned;
    } else {
      scores.push({ id: a.id, earned, possible: a.pointsPossible });
    }
  }
  const dropped = chooseDrops(scores, dropLowest, bonus);
  const kept = scores.filter((s) => !dropped.has(s.id));
  return {
    earned: kept.reduce((sum, s) => sum + s.earned, bonus),
    possible: kept.reduce((sum, s) => sum + s.possible, 0),
    dropped: [...dropped],
  };
}

function weightedAverage(parts: { weight: number; percent: number }[]): number | null {
  const total = parts.reduce((sum, p) => sum + p.weight, 0);
  if (total <= 0) return null;
  return clean(parts.reduce((sum, p) => sum + p.weight * p.percent, 0) / total);
}

/**
 * Percentage points a bonus category adds in a scenario, capped at its weight. With nothing
 * entered yet it is fully open, like a regular category: the whole cap in the max.
 */
function bonusPoints(items: GradeItem[], cap: number, scenario: Scenario): number {
  if (items.length === 0) return scenario === 'max' ? cap : 0;
  const earned = items.reduce((sum, a) => {
    if (a.pointsEarned !== null) return sum + a.pointsEarned;
    return scenario === 'max' ? sum + a.pointsPossible : sum;
  }, 0);
  return clean(Math.min(cap, earned));
}

/** Current, max and min percent for a course, with a per-category breakdown. */
export function courseGrade(input: CourseGradeInput): CourseGrade {
  const categoryIds = new Set(input.categories.map((c) => c.id));
  const byCategory = new Map<string, GradeItem[]>(input.categories.map((c) => [c.id, []]));
  const uncategorized: GradeItem[] = [];
  for (const a of input.assignments) {
    if (a.categoryId !== null && categoryIds.has(a.categoryId)) {
      byCategory.get(a.categoryId)?.push(a);
    } else {
      uncategorized.push(a);
    }
  }

  const bonus = input.categories
    .filter((c) => c.kind === 'bonus')
    .map((c) => {
      const items = byCategory.get(c.id) ?? [];
      const anyGraded = items.some((a) => a.pointsEarned !== null);
      return {
        categoryId: c.id,
        kind: 'bonus' as const,
        weight: c.weight,
        current: anyGraded ? bonusPoints(items, c.weight, 'current') : null,
        max: bonusPoints(items, c.weight, 'max'),
        min: bonusPoints(items, c.weight, 'min'),
        dropped: [],
      };
    });
  const withBonus = (base: number, scenario: Scenario) =>
    clean(bonus.reduce((sum, b) => sum + (b[scenario] ?? 0), base));

  const warnings: GradeWarning[] = [];
  const categories = input.categories
    .filter((c) => c.kind !== 'bonus')
    .map((c) => {
      const items = byCategory.get(c.id) ?? [];
      const current = pool(items, c.dropLowest, 'current');
      const max = pool(items, c.dropLowest, 'max');
      const min = pool(items, c.dropLowest, 'min');
      return {
        grade: {
          categoryId: c.id,
          kind: 'regular' as const,
          weight: c.weight,
          current: ratioPercent(current.earned, current.possible),
          // A category with nothing entered is fully open.
          max: ratioPercent(max.earned, max.possible) ?? 100,
          min: ratioPercent(min.earned, min.possible) ?? 0,
          dropped: current.dropped,
        },
        pools: { current, max, min },
      };
    });
  const dropped = categories.flatMap((c) => c.grade.dropped);
  // Keep the caller's category order in the breakdown.
  const order = new Map(input.categories.map((c, i) => [c.id, i]));
  const breakdown = [...categories.map((c) => c.grade), ...bonus].sort(
    (a, b) => (order.get(a.categoryId) ?? 0) - (order.get(b.categoryId) ?? 0),
  );

  if (input.grading === 'points') {
    const totals = (scenario: Scenario) => {
      const loose = pool(uncategorized, 0, scenario);
      return categories.reduce(
        (sum, c) => ({
          earned: sum.earned + c.pools[scenario].earned,
          possible: sum.possible + c.pools[scenario].possible,
        }),
        { earned: loose.earned, possible: loose.possible },
      );
    };
    const current = totals('current');
    const max = totals('max');
    const min = totals('min');
    const currentPercent = ratioPercent(current.earned, current.possible);
    return {
      current: currentPercent === null ? null : withBonus(currentPercent, 'current'),
      max: withBonus(ratioPercent(max.earned, max.possible) ?? 100, 'max'),
      min: withBonus(ratioPercent(min.earned, min.possible) ?? 0, 'min'),
      categories: breakdown,
      dropped,
      warnings,
    };
  }

  const totalWeight = categories.reduce((sum, c) => sum + c.grade.weight, 0);
  if (categories.length > 0 && Math.abs(totalWeight - 100) > 1e-6) {
    warnings.push({ code: 'weights_not_100', total: clean(totalWeight) });
  }
  if (uncategorized.length > 0) {
    warnings.push({ code: 'uncategorized_ignored', count: uncategorized.length });
  }

  const graded = categories.flatMap(({ grade }) =>
    grade.current === null ? [] : [{ weight: grade.weight, percent: grade.current }],
  );
  const current = weightedAverage(graded);
  const scenario = (key: 'max' | 'min') =>
    weightedAverage(categories.map((c) => ({ weight: c.grade.weight, percent: c.grade[key] })));
  return {
    current: current === null ? null : withBonus(current, 'current'),
    max: withBonus(scenario('max') ?? 100, 'max'),
    min: withBonus(scenario('min') ?? 0, 'min'),
    categories: breakdown,
    dropped,
    warnings,
  };
}
