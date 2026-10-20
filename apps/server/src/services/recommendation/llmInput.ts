import { createHash } from 'node:crypto';
import { priorityKeyOf, type CompromiseDto, type Priorities, type PriorityKey } from '@rel/shared';
import { RECOMMENDATION_CONFIG } from './config.js';

export type FactValue = number | string;

/** One compromise as the model sees it: a short id instead of the long compromise id. */
export interface LlmCandidate {
  /** "c1", "c2", … – a few tokens instead of e.g. "otherNeighborhood:נווה צדק". */
  ref: string;
  compromiseId: string;
  /** The requirement this compromise gives up. */
  give: PriorityKey;
  /** Display-ready values (percent as whole numbers, prices in NIS) – the only citable numbers. */
  facts: Record<string, FactValue>;
}

export interface LlmInput {
  /** Only the ratings of requirements that some candidate gives up. */
  priorities: Priorities;
  candidates: LlmCandidate[];
}

function percent(share: number): number {
  return Math.round(share * 100);
}

/** Short, display-ready facts. Keys are explained once in the (fixed) system prompt. */
function factsOf(
  compromise: CompromiseDto,
  baselineRate: number | null,
): Record<string, FactValue> {
  const { feasibility, params } = compromise;
  const facts: Record<string, FactValue> = {
    rate: percent(feasibility.matchRate ?? 0),
    pool: feasibility.poolSize,
    fit: feasibility.affordableCount,
  };
  // The current search's rate, to compare with ("לעומת X% בחיפוש הנוכחי"); absent when the
  // current search has too few deals to say.
  if (baselineRate !== null) {
    facts.now = percent(baselineRate);
  }
  if (params.rooms !== undefined) {
    facts.rooms = params.rooms;
  }
  if (params.neighborhood !== undefined) {
    facts.area = params.neighborhood;
  }
  if (params.cityName !== undefined) {
    facts.city = params.cityName;
  }
  if (params.distanceKm !== undefined) {
    facts.km = params.distanceKm;
  }
  if (params.newMaxPrice !== undefined) {
    facts.budget = params.newMaxPrice;
    const increase = compromise.facts.find((fact) => {
      return fact.key === 'budgetIncrease';
    });
    if (increase !== undefined && typeof increase.value === 'number') {
      facts.extra = increase.value;
    }
  }
  return facts;
}

/**
 * What the model gets: the best candidates and the user's relevant ratings. Ratings of
 * requirements no candidate touches are dropped – they can't change the answer, and leaving
 * them out makes identical questions (and cache hits) more likely.
 */
export function buildLlmInput(
  compromises: readonly CompromiseDto[],
  priorities: Priorities,
  baselineRate: number | null,
): LlmInput {
  const candidates = compromises
    .filter((compromise) => {
      return compromise.feasibility.matchRate !== null;
    })
    .slice(0, RECOMMENDATION_CONFIG.maxCandidates)
    .map((compromise, index) => {
      return {
        ref: `c${index + 1}`,
        compromiseId: compromise.id,
        give: priorityKeyOf(compromise),
        facts: factsOf(compromise, baselineRate),
      };
    });
  const relevant: Priorities = {};
  for (const key of [...new Set(candidates.map((candidate) => candidate.give))].sort()) {
    const value = priorities[key];
    if (value !== undefined) {
      relevant[key] = value;
    }
  }
  return { priorities: relevant, candidates };
}

/** The user message: compact JSON, no whitespace. */
export function serializeLlmInput(input: LlmInput): string {
  return JSON.stringify({
    p: input.priorities,
    c: input.candidates.map((candidate) => {
      return { id: candidate.ref, give: candidate.give, ...candidate.facts };
    }),
  });
}

/** sha256 of exactly what the model would see, plus the prompt version. */
export function cacheKeyOf(input: LlmInput): string {
  return createHash('sha256')
    .update(`v${RECOMMENDATION_CONFIG.promptVersion}|${serializeLlmInput(input)}`)
    .digest('hex');
}

/**
 * Whether asking the model can add anything: there must be a real choice (2+ candidates) and at
 * least one rating to personalize by (every reason has to cite one).
 */
export function isWorthAsking(input: LlmInput): boolean {
  return input.candidates.length >= 2 && Object.keys(input.priorities).length > 0;
}
