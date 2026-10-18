/**
 * Nearest-rank percentile: always returns a value that actually occurs in the data
 * (never an interpolated "3.25 rooms" or a price nobody paid).
 */
export function nearestRank(sortedAscending: readonly number[], share: number): number | undefined {
  if (sortedAscending.length === 0) {
    return undefined;
  }
  const rank = Math.max(1, Math.ceil(share * sortedAscending.length));
  return sortedAscending[Math.min(rank, sortedAscending.length) - 1];
}

export function sortedNumbers(values: Iterable<number>): number[] {
  return [...values].sort((a, b) => {
    return a - b;
  });
}
