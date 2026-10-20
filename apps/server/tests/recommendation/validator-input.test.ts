import { describe, expect, it } from 'vitest';
import { fallbackPicks } from '../../src/services/recommendation/fallback.js';
import {
  buildLlmInput,
  cacheKeyOf,
  isWorthAsking,
  serializeLlmInput,
} from '../../src/services/recommendation/llmInput.js';
import { validateAnswer } from '../../src/services/recommendation/validator.js';
import { COMPROMISES, GOOD_ANSWER } from './builders.js';

const PRIORITIES = { budget: 3, parking: 1, rooms: 5 };
const input = buildLlmInput(COMPROMISES, PRIORITIES);

function answer(why: string, overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    picks: [{ id: 'c2', why, facts: ['rate'], pri: ['parking'], ...overrides }],
  });
}

describe('buildLlmInput', () => {
  it('sends short ids, display-ready facts and only relevant priorities', () => {
    const withNoise = buildLlmInput(COMPROMISES, { ...PRIORITIES, city: 4, elevator: 2 });

    expect(withNoise.priorities).toEqual({ budget: 3, parking: 1, rooms: 5 });
    expect(withNoise.candidates.map((candidate) => candidate.ref)).toEqual(['c1', 'c2', 'c3']);
    expect(withNoise.candidates[0]?.facts).toEqual({
      rate: 50,
      gain: 35,
      pool: 20,
      fit: 10,
      budget: 2_450_000,
      extra: 450_000,
    });
    expect(serializeLlmInput(withNoise)).not.toContain(' ');
  });

  it('gives the same cache key when only irrelevant priorities differ', () => {
    expect(cacheKeyOf(buildLlmInput(COMPROMISES, { ...PRIORITIES, city: 5 }))).toBe(
      cacheKeyOf(input),
    );
    expect(cacheKeyOf(buildLlmInput(COMPROMISES, { ...PRIORITIES, parking: 2 }))).not.toBe(
      cacheKeyOf(input),
    );
  });

  it('is not worth asking without a choice or without a relevant priority', () => {
    expect(isWorthAsking(input)).toBe(true);
    expect(isWorthAsking(buildLlmInput(COMPROMISES.slice(0, 1), PRIORITIES))).toBe(false);
    expect(isWorthAsking(buildLlmInput(COMPROMISES, { city: 5 }))).toBe(false);
  });
});

describe('validateAnswer', () => {
  it('accepts a grounded answer and maps short ids back to compromise ids', () => {
    const result = validateAnswer(GOOD_ANSWER, input);

    expect(result).toEqual({
      ok: true,
      picks: [
        { compromiseId: 'dropFeature:parking', reason: expect.stringContaining('40%') as string },
        { compromiseId: 'raiseBudget', reason: expect.stringContaining('450,000') as string },
      ],
    });
  });

  it('rejects broken JSON and schema mismatches', () => {
    expect(validateAnswer('{"picks": [', input).ok).toBe(false);
    expect(validateAnswer('{"picks": []}', input).ok).toBe(false);
    expect(validateAnswer('{"choices": []}', input).ok).toBe(false);
  });

  it('rejects an invented number', () => {
    const result = validateAnswer(answer('בלי חניה 63% מהעסקאות נמכרו בתקציב.'), input);

    expect(result).toEqual({ ok: false, errors: [expect.stringContaining('63') as string] });
  });

  it('rejects a number that belongs to a fact the pick did not cite', () => {
    // 20 is the pool size – true, but not cited in "facts".
    expect(validateAnswer(answer('החניה בחשיבות 1, ו-20 עסקאות מתאימות.'), input).ok).toBe(false);
  });

  it('rejects unknown and duplicate ids', () => {
    expect(validateAnswer(answer('החניה בחשיבות 1.', { id: 'c9' }), input).ok).toBe(false);
    const twice = JSON.stringify({
      picks: [
        { id: 'c2', why: 'החניה בחשיבות 1.', facts: ['rate'], pri: ['parking'] },
        { id: 'c2', why: 'החניה בחשיבות 1.', facts: ['rate'], pri: ['parking'] },
      ],
    });
    expect(validateAnswer(twice, input).ok).toBe(false);
  });

  it('requires citing at least one own fact and one given priority', () => {
    expect(validateAnswer(answer('החניה בחשיבות 1.', { facts: [] }), input).ok).toBe(false);
    expect(validateAnswer(answer('החניה בחשיבות 1.', { facts: ['extra'] }), input).ok).toBe(false);
    expect(validateAnswer(answer('החניה בחשיבות 1.', { pri: [] }), input).ok).toBe(false);
    expect(validateAnswer(answer('החניה בחשיבות 1.', { pri: ['city'] }), input).ok).toBe(false);
  });

  it('rejects forecasts, outside knowledge and English', () => {
    expect(validateAnswer(answer('המחירים צפויים לעלות, החניה בחשיבות 1.'), input).ok).toBe(false);
    expect(validateAnswer(answer('בלי חניה, וקרוב לבתי ספר טובים.'), input).ok).toBe(false);
    expect(validateAnswer(answer('parking בחשיבות 1.'), input).ok).toBe(false);
  });

  it('rejects an overlong reason', () => {
    expect(validateAnswer(answer('א'.repeat(161)), input).ok).toBe(false);
  });
});

describe('fallbackPicks', () => {
  it('puts what the user rated least important first, then the bigger improvement', () => {
    // parking 1, budget 3, rooms 5 – although raising the budget improves the most.
    const picks = fallbackPicks(input, PRIORITIES);

    expect(picks.map((pick) => pick.compromiseId)).toEqual([
      'dropFeature:parking',
      'raiseBudget',
      'fewerRooms',
    ]);
    expect(picks[0]?.reason).toBe(
      'דירגת את החניה בחשיבות 1 מתוך 5. עם השינוי הזה 40% מהעסקאות המתאימות נמכרו בתקציב (8 מתוך 20).',
    );
  });

  it('keeps the improvement order when nothing is rated (or ratings are equal)', () => {
    const unrated = buildLlmInput(COMPROMISES, {});

    expect(fallbackPicks(unrated, {}).map((pick) => pick.compromiseId)).toEqual([
      'raiseBudget',
      'dropFeature:parking',
      'fewerRooms',
    ]);
  });

  it('template reasons pass the same validator rules for numbers', () => {
    for (const pick of fallbackPicks(input, PRIORITIES)) {
      expect(/[A-Za-z]/.test(pick.reason)).toBe(false);
    }
  });
});
