import type { IndexPointInput, PricedDeal, SnapshotDeal } from './types.js';

export interface PriceAdjuster {
  /** The index month all prices are expressed in (YYYY-MM-01), or null without an index. */
  referencePeriod: string | null;
  adjust(deal: SnapshotDeal): PricedDeal;
}

/**
 * Expresses deal prices in terms of the latest CBS dwelling price index month:
 * adjusted = price × (latest index / index in the deal's month). A deal without a date, or in
 * a month the index does not cover, keeps its original price and is marked as not adjusted.
 */
export function createPriceAdjuster(points: readonly IndexPointInput[]): PriceAdjuster {
  const byPeriod = new Map(
    points.map((point) => {
      return [point.period, point.value] as const;
    }),
  );
  const latest = [...points]
    .sort((a, b) => {
      return a.period.localeCompare(b.period);
    })
    .at(-1);

  return {
    referencePeriod: latest?.period ?? null,
    adjust(deal) {
      const dealMonth = deal.dealDate === null ? undefined : `${deal.dealDate.slice(0, 7)}-01`;
      const dealIndex = dealMonth === undefined ? undefined : byPeriod.get(dealMonth);
      if (latest === undefined || dealIndex === undefined) {
        return { ...deal, adjustedPrice: deal.priceNis, isAdjusted: false };
      }
      return {
        ...deal,
        adjustedPrice: Math.round((deal.priceNis * latest.value) / dealIndex),
        isAdjusted: true,
      };
    },
  };
}
