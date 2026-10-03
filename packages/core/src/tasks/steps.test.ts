import { describe, expect, it } from 'vitest';
import { formatSteps, parseSteps, stepTotals } from './steps';

describe('parseSteps', () => {
  it('reads hands-on steps and waits', () => {
    const parsed = parseSteps(
      'Load the washer 5m, wait 45m, Move to the dryer 5 min; wait 1h dryer\nFold 15m',
    );
    expect(parsed).toEqual({
      ok: true,
      steps: [
        { title: 'Load the washer', minutes: 5, wait: false },
        { title: '', minutes: 45, wait: true },
        { title: 'Move to the dryer', minutes: 5, wait: false },
        { title: 'dryer', minutes: 60, wait: true },
        { title: 'Fold', minutes: 15, wait: false },
      ],
    });
  });

  it('takes the duration from anywhere in the item and keeps numbers in titles', () => {
    expect(parseSteps('10m read 2 pages, waiting for the oven 1h 30m, 1:15 bake')).toEqual({
      ok: true,
      steps: [
        { title: 'read 2 pages', minutes: 10, wait: false },
        { title: 'the oven', minutes: 90, wait: true },
        { title: 'bake', minutes: 75, wait: false },
      ],
    });
  });

  it('treats blank text as no steps', () => {
    expect(parseSteps('  ')).toEqual({ ok: true, steps: [] });
  });

  it('says what is wrong', () => {
    expect(parseSteps('Load the washer')).toEqual({
      ok: false,
      error: '“Load the washer” needs a duration, like 5m or 1h',
    });
    expect(parseSteps('5m')).toEqual({ ok: false, error: 'Name the step that takes 5m' });
    expect(parseSteps('wait 25h')).toEqual({ ok: false, error: '“wait 25h” is longer than a day' });
    expect(parseSteps(Array.from({ length: 21 }, () => 'x 5m').join(','))).toEqual({
      ok: false,
      error: 'At most 20 steps',
    });
  });

  it('round-trips through formatSteps', () => {
    const text = 'Load the washer 5m, wait 45m, Move to the dryer 5m, wait 1h dryer, Fold 15m';
    const parsed = parseSteps(text);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(formatSteps(parsed.steps)).toBe(text);
    expect(stepTotals(parsed.steps)).toEqual({ handsOnMin: 25, totalMin: 130 });
  });
});
