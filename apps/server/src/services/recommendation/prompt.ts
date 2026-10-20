import { PRIORITY_KEYS, PRIORITY_LABELS } from '@rel/shared';
import { RECOMMENDATION_CONFIG } from './config.js';

const requirementNames = PRIORITY_KEYS.map((key) => {
  return `${key}=${PRIORITY_LABELS[key]}`;
}).join(', ');

/**
 * Fixed system prompt. English instructions take far fewer tokens than Hebrew; the answer is
 * Hebrew. It is identical for every request, so providers can cache it on their side too.
 */
export const SYSTEM_PROMPT = `You rank apartment-search compromises for one user.
Input JSON: "p" = the user's importance ratings of requirements (1 = low, 5 = very important). "c" = candidate compromises; each gives up requirement "give" and has computed facts.
Fact keys: rate = % of matching past deals sold within budget after the change; gain = improvement in percentage points; pool = matching past deals; fit = how many of them were within budget; rooms = new room count; area = neighborhood; city = nearby city; km = distance in km; budget = new budget in NIS; extra = budget increase in NIS.
Requirement names in Hebrew: ${requirementNames}.
Task: pick up to ${RECOMMENDATION_CONFIG.maxPicks} candidates that suit this user best, best first: prefer giving up requirements the user rated low, then a larger gain.
For each pick write "why": one short Hebrew sentence (at most ${RECOMMENDATION_CONFIG.maxReasonLength} characters) that links the user's rating to the candidate's facts. Use only the given facts and ratings. Copy numbers exactly as given (you may add % after rate or gain and ₪ after budget or extra). No other knowledge: no forecasts, advice, schools, transport, family, safety or neighborhood character. No English words.
"facts" = keys of the facts you cited; "pri" = keys of the ratings you cited (at least one of each).`;

/** JSON Schema of the answer; both providers enforce it while generating. */
export const ANSWER_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    picks: {
      type: 'array',
      maxItems: RECOMMENDATION_CONFIG.maxPicks,
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          why: { type: 'string' },
          facts: { type: 'array', items: { type: 'string' } },
          pri: { type: 'array', items: { type: 'string' } },
        },
        required: ['id', 'why', 'facts', 'pri'],
        additionalProperties: false,
      },
    },
  },
  required: ['picks'],
  additionalProperties: false,
};

/** Follow-up for the single repair attempt. */
export function repairMessage(errors: readonly string[]): string {
  return `Your answer was rejected: ${errors.join('; ')}. Return a corrected answer.`;
}
