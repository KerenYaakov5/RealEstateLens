import { FEATURE_LABELS, FEATURES, type MarketAssessmentDto } from '@rel/shared';
import { formatDate, formatPrice } from '../../lib/format';
import { propertyTypeLabel } from './labels';

type ReferenceDeal = MarketAssessmentDto['referenceDeals'][number];

function featureList(deal: ReferenceDeal): string {
  const present = FEATURES.filter((feature) => deal.features[feature] === true).map(
    (feature) => FEATURE_LABELS[feature],
  );
  return present.length === 0 ? '—' : present.join(' · ');
}

function placeOf(deal: ReferenceDeal): string {
  return deal.neighborhood === null ? deal.street : `${deal.street}, ${deal.neighborhood.name}`;
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
        <p className="mt-3 text-ink-soft">אין עסקאות שעונות על כל הדרישות בתקציב הזה.</p>
      ) : (
        <>
          {/* Desktop: a table */}
          <table className="mt-4 hidden w-full text-sm md:table">
            <thead className="text-start text-xs text-muted">
              <tr>
                <th className="pb-2 text-start font-medium">כתובת</th>
                <th className="pb-2 text-start font-medium">סוג</th>
                <th className="pb-2 text-start font-medium">חדרים</th>
                <th className="pb-2 text-start font-medium">מ"ר</th>
                <th className="pb-2 text-start font-medium">כולל</th>
                <th className="pb-2 text-start font-medium">תאריך</th>
                <th className="pb-2 text-start font-medium">מחיר</th>
              </tr>
            </thead>
            <tbody>
              {deals.map((deal) => (
                <tr key={deal.id} className="border-t border-line">
                  <td className="py-2">{placeOf(deal)}</td>
                  <td className="py-2">{propertyTypeLabel(deal.propertyType)}</td>
                  <td className="num py-2">{deal.rooms}</td>
                  <td className="num py-2">{deal.sizeSqm ?? '—'}</td>
                  <td className="py-2 text-xs">{featureList(deal)}</td>
                  <td className="num py-2">
                    {deal.dealDate === null ? '—' : formatDate(deal.dealDate)}
                  </td>
                  <td className="py-2">
                    <span className="num block font-bold">{formatPrice(deal.priceNis)}</span>
                    {deal.isAdjusted && deal.adjustedPriceNis !== deal.priceNis && (
                      <span className="num block text-xs text-muted">
                        היום כ-{formatPrice(deal.adjustedPriceNis)}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Mobile: cards */}
          <ul className="mt-4 space-y-3 md:hidden">
            {deals.map((deal) => (
              <li key={deal.id} className="rounded-xl border border-line p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium">{placeOf(deal)}</span>
                  <span className="num font-bold">{formatPrice(deal.priceNis)}</span>
                </div>
                <p className="mt-1 text-sm text-ink-soft">
                  {propertyTypeLabel(deal.propertyType)} · <span className="num">{deal.rooms}</span>{' '}
                  חדרים
                  {deal.sizeSqm !== null && (
                    <>
                      {' '}
                      · <span className="num">{deal.sizeSqm}</span> מ"ר
                    </>
                  )}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {featureList(deal)}
                  {deal.dealDate !== null && (
                    <>
                      {' '}
                      · <span className="num">{formatDate(deal.dealDate)}</span>
                    </>
                  )}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </details>
  );
}
