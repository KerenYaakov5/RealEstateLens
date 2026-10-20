import { MAX_PRIORITY, type PriorityKey, type RecommendationPickDto } from '@rel/shared';
import { z } from 'zod';
import { RECOMMENDATION_CONFIG } from './config.js';
import type { LlmInput } from './llmInput.js';

export type ValidationResult =
  | { ok: true; picks: RecommendationPickDto[] }
  /** Errors are in English: they are sent back to the model in the repair attempt. */
  | { ok: false; errors: string[] };

const answerSchema = z.object({
  picks: z
    .array(
      z.object({
        id: z.string(),
        why: z.string(),
        facts: z.array(z.string()),
        pri: z.array(z.string()),
      }),
    )
    .min(1)
    .max(RECOMMENDATION_CONFIG.maxPicks),
});

/** Large amounts the model copied without separators: "3889710" → "3,889,710". */
function withThousandsSeparators(text: string): string {
  return text.replace(/\d{5,}/g, (digits) => {
    return Number(digits).toLocaleString('en-US');
  });
}

/** "2,450,000" → 2450000, "41.5" → 41.5 */
function numbersIn(text: string): number[] {
  return (text.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((match) => {
    return Number(match.replace(/,/g, ''));
  });
}

/**
 * Checks a model answer before anything is shown. Every pick must be one of our candidates,
 * cite at least one of its facts and one of the user's ratings, and its reason may contain only
 * numbers from what it cited – so the model can rank and explain, but never invent.
 */
export function validateAnswer(text: string, input: LlmInput): ValidationResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['the answer is not valid JSON'] };
  }
  const parsed = answerSchema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, errors: ['the answer does not match the schema'] };
  }

  const errors: string[] = [];
  const seen = new Set<string>();
  const picks: RecommendationPickDto[] = [];
  for (const pick of parsed.data.picks) {
    const candidate = input.candidates.find((item) => {
      return item.ref === pick.id;
    });
    if (candidate === undefined) {
      errors.push(`unknown id "${pick.id}"`);
      continue;
    }
    if (seen.has(pick.id)) {
      errors.push(`id "${pick.id}" picked twice`);
      continue;
    }
    seen.add(pick.id);

    const pickErrors: string[] = [];
    const facts = pick.facts.filter((key) => {
      return Object.hasOwn(candidate.facts, key);
    });
    if (facts.length !== pick.facts.length || facts.length === 0) {
      pickErrors.push(`${pick.id}: "facts" must list at least one, and only, keys of its facts`);
    }
    const ratings = pick.pri.filter((key) => {
      return Object.hasOwn(input.priorities, key);
    });
    if (ratings.length !== pick.pri.length || ratings.length === 0) {
      pickErrors.push(`${pick.id}: "pri" must list at least one, and only, keys of "p"`);
    }

    const why = pick.why.trim();
    if (why.length === 0 || why.length > RECOMMENDATION_CONFIG.maxReasonLength) {
      pickErrors.push(
        `${pick.id}: "why" must be 1–${RECOMMENDATION_CONFIG.maxReasonLength} characters`,
      );
    }
    if (/[A-Za-z]/.test(why)) {
      pickErrors.push(`${pick.id}: "why" must be Hebrew only, without English words or keys`);
    }
    const forbidden = RECOMMENDATION_CONFIG.forbiddenPhrases.filter((phrase) => {
      return why.includes(phrase);
    });
    if (forbidden.length > 0) {
      pickErrors.push(
        `${pick.id}: "why" uses outside knowledge or a forecast (${forbidden.join(', ')})`,
      );
    }

    const allowed = new Set<number>([MAX_PRIORITY]);
    for (const key of facts) {
      const value = candidate.facts[key];
      if (typeof value === 'number') {
        allowed.add(value);
      }
    }
    for (const key of ratings) {
      const value = input.priorities[key as PriorityKey];
      if (value !== undefined) {
        allowed.add(value);
      }
    }
    const invented = numbersIn(why).filter((value) => {
      return !allowed.has(value);
    });
    if (invented.length > 0) {
      pickErrors.push(
        `${pick.id}: "why" has numbers not in its cited facts (${invented.join(', ')})`,
      );
    }

    if (pickErrors.length > 0) {
      errors.push(...pickErrors);
    } else {
      picks.push({ compromiseId: candidate.compromiseId, reason: withThousandsSeparators(why) });
    }
  }
  return errors.length === 0 ? { ok: true, picks } : { ok: false, errors };
}
