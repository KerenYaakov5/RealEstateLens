import type { NormalizedDeal } from './rowMapper.js';

export interface DuplicateRejection {
  deal: NormalizedDeal;
  keptRowNumber: number;
  reason: string;
}

export interface DedupeResult {
  kept: NormalizedDeal[];
  rejected: DuplicateRejection[];
}

/**
 * Agreed rule for rows sharing a deal_id: keep the one with the latest valid date.
 * A row without a valid date loses to one with a date. When no row has a date, or the
 * dates are equal, the row that appears later in the file wins.
 */
function preferred(a: NormalizedDeal, b: NormalizedDeal): number {
  if (a.dealDate !== b.dealDate) {
    if (a.dealDate === null) {
      return 1;
    }
    if (b.dealDate === null) {
      return -1;
    }
    return a.dealDate > b.dealDate ? -1 : 1;
  }
  return b.rowNumber - a.rowNumber;
}

export function dedupeDeals(deals: readonly NormalizedDeal[]): DedupeResult {
  const groups = new Map<string, NormalizedDeal[]>();
  for (const deal of deals) {
    const group = groups.get(deal.dealId);
    if (group === undefined) {
      groups.set(deal.dealId, [deal]);
    } else {
      group.push(deal);
    }
  }

  const kept: NormalizedDeal[] = [];
  const rejected: DuplicateRejection[] = [];
  for (const group of groups.values()) {
    const [winner, ...losers] = [...group].sort(preferred);
    if (winner === undefined) {
      continue;
    }
    kept.push(winner);
    for (const loser of losers) {
      rejected.push({
        deal: loser,
        keptRowNumber: winner.rowNumber,
        reason: `כפילות של ${winner.dealId} – נשמרה שורה ${winner.rowNumber}`,
      });
    }
  }

  kept.sort((a, b) => {
    return a.rowNumber - b.rowNumber;
  });
  return { kept, rejected };
}
