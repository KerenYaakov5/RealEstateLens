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
Input JSON: "p" = how hard it is for the user to give up each requirement (1 = easy to give up, 5 = very hard). "c" = candidate compromises; each gives up requirement "give" and has computed facts.
Fact keys: rate = % of matching past deals sold within budget after the change; now = that % in the current search, before the change; pool = matching past deals; fit = how many of them were within budget; rooms = new room count; area = neighborhood; city = nearby city; km = distance in km; budget = new budget in NIS; extra = budget increase in NIS.
Requirement names in Hebrew: ${requirementNames}.
Task: pick up to ${RECOMMENDATION_CONFIG.maxPicks} candidates that suit this user best, best first: prefer giving up requirements the user rated low, then a larger rise of rate over now.
For each pick write "why": one short Hebrew sentence (at most ${RECOMMENDATION_CONFIG.reasonTargetLength} characters) that links the user's rating to the candidate's facts.
Phrase facts exactly like this: rate → "X% מהעסקאות המתאימות נמכרו בתקציב"; fit and pool → "X מתוך Y עסקאות"; now → "לעומת X% בחיפוש הנוכחי". At most one pair of parentheses, e.g. "(3 מתוך 5 עסקאות, לעומת 0% בחיפוש הנוכחי)"; rating N of 1–2 → "קל לך לוותר על <requirement> (N מתוך 5)"; N of 3 → "קשה לך במידה בינונית לוותר על <requirement> (3 מתוך 5)"; N of 4–5 → start with "למרות שקשה לך לוותר על <requirement> (N מתוך 5):". Describe past deals only: never chances, success, supply, demand or what the user will find.
Name the change like this: city → "במעבר ל<city>"; a feature → "בלי <feature>"; rooms → "עם <rooms> חדרים"; budget → "עם תקציב של <budget> ₪"; area → "בשכונת <area>"; any neighborhood → "בכל השכונות בעיר".
Examples of the style (not real data): "קל לך לוותר על החניה (1 מתוך 5); בלי חניה 40% מהעסקאות המתאימות נמכרו בתקציב (8 מתוך 20 עסקאות)." / "למרות שקשה לך לוותר על מספר החדרים (5 מתוך 5): עם 3 חדרים 20% מהעסקאות המתאימות נמכרו בתקציב (לעומת 0% בחיפוש הנוכחי)."  Use only the given facts and ratings. Copy numbers exactly as given (add % only after rate or now, ₪ only after budget or extra). No other knowledge: no forecasts, advice, schools, transport, family, safety or neighborhood character. No English words.
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
