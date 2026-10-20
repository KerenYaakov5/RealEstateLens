import { FEATURE_LABELS, FEATURES, type MarketAssessmentDto } from '@rel/shared';
import { formatDate, formatPrice } from '../../lib/format';
import { propertyTypeLabel, roomsLabel } from './labels';

type ReferenceDeal = MarketAssessmentDto['referenceDeals'][number];

/** Light pastel backgrounds, cycled so neighbouring cards are easy to tell apart. */
const TINTS = [
  'bg-brand-soft/60',
  'bg-compromise-soft/70',
  'bg-good-soft/70',
  'bg-warn-soft/80',
] as const;

function placeOf(deal: ReferenceDeal): string {
  return deal.neighborhood === null ? deal.street : `${deal.street}, ${deal.neighborhood.name}`;
}

function floorText(deal: ReferenceDeal): string | null {
  if (deal.floor === null) {
    return null;
  }
  return deal.floor === 0 ? 'קומת קרקע' : `קומה ${deal.floor} מתוך ${deal.totalFloors}`;
}

function DealCard({ deal, tint }: { deal: ReferenceDeal; tint: string }) {
  const features = FEATURES.filter((feature) => deal.features[feature] === true);
  const floor = floorText(deal);
  return (
    <li className={`flex h-full flex-col rounded-xl p-4 ${tint}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="text-lg font-extrabold">{formatPrice(deal.priceNis)}</span>
        {deal.dealDate !== null && (
          <span className="num text-xs text-muted">{formatDate(deal.dealDate)}</span>
        )}
      </div>
      {deal.isAdjusted && deal.adjustedPriceNis !== deal.priceNis && (
        <span className="text-xs text-ink-soft">היום כ-{formatPrice(deal.adjustedPriceNis)}</span>
      )}

      <p className="mt-2 font-medium">{placeOf(deal)}</p>
      <p className="mt-0.5 text-sm text-ink-soft">
        {propertyTypeLabel(deal.propertyType)} · {roomsLabel(deal.rooms)}
        {deal.sizeSqm !== null && (
          <>
            {' '}
            · <span className="num">{deal.sizeSqm}</span> מ"ר
          </>
        )}
        {floor !== null && <> · {floor}</>}
      </p>

      {features.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="כולל">
          {features.map((feature) => (
            <li
              key={feature}
              className={`rounded-full bg-surface/80 px-2 py-0.5 text-xs ${
                deal.matchedPreferences.includes(feature) ? 'font-bold text-brand-strong' : ''
              }`}
            >
              {FEATURE_LABELS[feature]}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/** Real past deals that fit the requirements and the budget – the evidence behind the numbers. */
export function ReferenceDeals({ deals }: { deals: ReferenceDeal[] }) {
  return (
    <details className="rounded-(--radius-card) bg-surface p-5 shadow-(--shadow-card)">
      <summary className="cursor-pointer text-lg font-bold">
        עסקאות אמת שמתאימות לך{' '}
        <span className="num text-base font-normal text-muted">({deals.length})</span>
      </summary>

      {deals.length === 0 ? (
        <p className="mt-3 text-ink-soft">
          לא נמצאו עסקאות עבר שנמכרו עם המאפיינים האלו בתקציב הזה.
        </p>
      ) : (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {deals.map((deal, index) => (
            <DealCard key={deal.id} deal={deal} tint={TINTS[index % TINTS.length] ?? TINTS[0]} />
          ))}
        </ul>
      )}
    </details>
  );
}
