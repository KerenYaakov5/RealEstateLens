import type { CompromiseDto } from '@rel/shared';
import type { LlmProvider, LlmRequest, LlmResponse } from '../../src/clients/llm/types.js';

/** A compromise as GET /market-assessments returns it. */
export function compromise(
  id: string,
  type: CompromiseDto['type'],
  params: CompromiseDto['params'],
  matchRate: number,
  delta: number,
): CompromiseDto {
  const poolSize = 20;
  const affordableCount = Math.round(matchRate * poolSize);
  return {
    id,
    type,
    params,
    feasibility: { matchRate, poolSize, affordableCount, unknownCount: 0, confidence: 'high' },
    delta,
    facts: [
      ...(params.newMaxPrice === undefined
        ? []
        : [
            {
              id: `${id}#budgetIncrease`,
              key: 'budgetIncrease',
              value: params.newMaxPrice - 2_000_000,
            },
          ]),
    ],
  };
}

/** Sorted by improvement, as the engine returns them. */
export const COMPROMISES: CompromiseDto[] = [
  compromise('raiseBudget', 'raiseBudget', { newMaxPrice: 2_450_000 }, 0.5, 0.35),
  compromise('dropFeature:parking', 'dropFeature', { feature: 'parking' }, 0.4, 0.25),
  compromise('fewerRooms', 'fewerRooms', { rooms: 3 }, 0.3, 0.15),
];

/** What a good model answer looks like for COMPROMISES (c1 budget, c2 parking, c3 rooms). */
export const GOOD_ANSWER = JSON.stringify({
  picks: [
    {
      id: 'c2',
      why: 'דירגת את החניה בחשיבות 1, ובלעדיה 40% מהעסקאות המתאימות נמכרו בתקציב.',
      facts: ['rate'],
      pri: ['parking'],
    },
    {
      id: 'c1',
      why: 'התקציב בחשיבות 3: תוספת של 450,000 ₪ מעלה את ההתאמה ל-50%.',
      facts: ['extra', 'rate'],
      pri: ['budget'],
    },
  ],
});

type Behavior = string | Error | ((request: LlmRequest) => Promise<LlmResponse>);

/** A provider that plays back scripted answers (text), failures (Error) or custom behavior. */
export class FakeProvider implements LlmProvider {
  readonly calls: LlmRequest[] = [];

  constructor(
    readonly name: string,
    private readonly script: Behavior[],
    readonly model = `${name}-test`,
  ) {}

  async complete(request: LlmRequest): Promise<LlmResponse> {
    this.calls.push(request);
    const next = this.script[Math.min(this.calls.length - 1, this.script.length - 1)];
    if (next === undefined) {
      throw new Error('FakeProvider has no script');
    }
    if (next instanceof Error) {
      throw next;
    }
    if (typeof next === 'function') {
      return next(request);
    }
    return { text: next, inputTokens: 100, outputTokens: 40 };
  }
}
