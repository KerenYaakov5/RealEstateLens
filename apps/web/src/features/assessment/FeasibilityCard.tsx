import type { MarketAssessmentDto } from '@rel/shared';
import { formatMonth, formatPercent } from '../../lib/format';
import { CONFIDENCE_LABELS } from './labels';

const CONFIDENCE_TONE = {
  insufficient: 'bg-sand text-ink-soft',
  low: 'bg-warn-soft text-warn-ink',
  medium: 'bg-brand-soft text-brand-strong',
  high: 'bg-good-soft text-good-ink',
} as const;

function rateTone(rate: number): string {
  if (rate >= 0.5) {
    return 'text-good';
  }
  if (rate >= 0.2) {
    return 'text-warn';
  }
  return 'text-bad';
}

export function FeasibilityCard({ assessment }: { assessment: MarketAssessmentDto }) {
  const { feasibility, cityLevel, referencePeriod, methodology } = assessment;
  const place =
    assessment.neighborhood === null
      ? assessment.city.name
      : `${assessment.neighborhood.name}, ${assessment.city.name}`;

  return (
    <section
      aria-label="היתכנות"
      className="rounded-(--radius-card) bg-surface p-5 shadow-(--shadow-card)"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-lg font-bold">כמה מהדירות שאת/ה מחפש/ת נמכרו בתקציב?</h2>
        <span
          className={`rounded-full px-3 py-1 text-xs font-bold ${CONFIDENCE_TONE[feasibility.confidence]}`}
        >
          {CONFIDENCE_LABELS[feasibility.confidence]}
        </span>
      </div>

      {feasibility.matchRate === null ? (
        <p className="mt-4 text-ink-soft">
          נמצאו רק <span className="num font-bold">{feasibility.poolSize}</span> עסקאות שעונות על
          הדרישות ב{place} – פחות מ-{methodology.minDealsForRate}, ולכן אי אפשר להסיק מהן מסקנה.
        </p>
      ) : (
        <div className="mt-3 flex flex-wrap items-end gap-x-4 gap-y-1">
          <span className={`num text-6xl font-extrabold ${rateTone(feasibility.matchRate)}`}>
            {formatPercent(feasibility.matchRate)}
          </span>
          <p className="pb-2 text-ink-soft">
            מתוך <span className="num font-bold text-ink">{feasibility.poolSize}</span> דירות שעונות
            על הדרישות ב{place},{' '}
            <span className="num font-bold text-ink">{feasibility.affordableCount}</span> נמכרו
            בתקציב שלך.
          </p>
        </div>
      )}

      {feasibility.unknownCount > 0 && (
        <p className="mt-2 text-sm text-muted">
          עוד <span className="num">{feasibility.unknownCount}</span> עסקאות אולי מתאימות, אבל חסר
          בהן מידע כדי לדעת בוודאות.
        </p>
      )}

      {cityLevel !== null && cityLevel.matchRate !== null && (
        <p className="mt-2 text-sm text-ink-soft">
          בכל {assessment.city.name}:{' '}
          <span className="num font-bold">{formatPercent(cityLevel.matchRate)}</span> מתוך{' '}
          <span className="num">{cityLevel.poolSize}</span> עסקאות.
        </p>
      )}

      {referencePeriod !== null && (
        <p className="mt-4 border-t border-line pt-3 text-xs text-muted">
          המחירים הותאמו ל{formatMonth(referencePeriod)} לפי {methodology.priceIndexSource} – הערכה,
          לא מחיר שנמכר בפועל.
        </p>
      )}
    </section>
  );
}
