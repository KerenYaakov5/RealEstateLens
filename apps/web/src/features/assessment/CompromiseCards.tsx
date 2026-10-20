import type { CompromiseDto, RecommendationDto } from '@rel/shared';
import { formatPercent, formatPoints } from '../../lib/format';
import { compromiseTitle } from './labels';

/** How many compromises are shown at once – the API returns all of them, best first. */
const SHOWN = 4;

interface CompromiseCardsProps {
  compromises: CompromiseDto[];
  /** Personal picks for the current requirements, or null for the default ranking. */
  recommendation: RecommendationDto | null;
  onApply: (compromise: CompromiseDto) => void;
}

interface Card {
  compromise: CompromiseDto;
  reason: string | null;
}

function cardsToShow(
  compromises: CompromiseDto[],
  recommendation: RecommendationDto | null,
): Card[] {
  if (recommendation === null || recommendation.picks.length === 0) {
    return compromises.slice(0, SHOWN).map((compromise) => {
      return { compromise, reason: null };
    });
  }
  return recommendation.picks.flatMap((pick) => {
    const compromise = compromises.find((item) => {
      return item.id === pick.compromiseId;
    });
    return compromise === undefined ? [] : [{ compromise, reason: pick.reason }];
  });
}

export function CompromiseCards({ compromises, recommendation, onApply }: CompromiseCardsProps) {
  if (compromises.length === 0) {
    return null;
  }
  const cards = cardsToShow(compromises, recommendation);
  const personal = recommendation !== null && recommendation.source !== 'fallback';
  return (
    <section aria-label="על מה אפשר להתפשר">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-bold">על מה אפשר להתפשר?</h2>
        {recommendation !== null && (
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
              personal ? 'bg-brand-soft text-brand-strong' : 'bg-sand text-ink-soft'
            }`}
            title={
              personal
                ? 'נבחר לפי החשיבות שנתת לכל דרישה, רק מתוך העסקאות שלנו'
                : 'דירוג לפי השיפור הגדול ביותר – ההמלצה האישית לא הייתה זמינה כרגע'
            }
          >
            {personal ? 'המלצה אישית' : 'המלצה אוטומטית'}
          </span>
        )}
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {cards.map(({ compromise, reason }) => (
          <li key={compromise.id}>
            <button
              type="button"
              onClick={() => {
                onApply(compromise);
              }}
              className="group h-full w-full rounded-(--radius-card) border-2 border-transparent bg-surface p-4 text-start shadow-(--shadow-card) transition hover:border-compromise"
            >
              <span className="block font-bold">{compromiseTitle(compromise)}</span>
              {compromise.feasibility.matchRate !== null && (
                <span className="mt-2 flex items-baseline gap-2">
                  <span className="num text-2xl font-extrabold text-compromise">
                    {formatPercent(compromise.feasibility.matchRate)}
                  </span>
                  <span className="num rounded-full bg-compromise-soft px-2 py-0.5 text-xs font-bold text-compromise">
                    {formatPoints(compromise.delta)}
                  </span>
                </span>
              )}
              <span className="mt-1 block text-xs text-muted">
                על סמך <span className="num">{compromise.feasibility.poolSize}</span> עסקאות
              </span>
              {reason !== null && (
                <span className="mt-2 block text-sm text-ink-soft">{reason}</span>
              )}
              <span className="mt-3 block text-sm font-medium text-brand transition sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-visible:opacity-100">
                להחיל את השינוי ←
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
