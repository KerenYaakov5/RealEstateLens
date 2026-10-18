import {
  DWELLING_PRICES_SERIES,
  type CbsClient,
  type IndexPoint,
  type MonthPeriod,
} from '../clients/cbs/cbsClient.js';
import type { Logger } from '../lib/logger.js';
import {
  toPeriod,
  type PriceIndexRepository,
  type StoredIndexPoint,
} from '../repositories/priceIndex.repository.js';

/** CBS revises the last three published months of the dwelling price index. */
const PROVISIONAL_MONTHS = 3;
const REFRESH_AFTER_DAYS = 30;
const MS_PER_DAY = 86_400_000;

export type EnsureOutcome = 'up-to-date' | 'fetched' | 'fetch-failed';

/**
 * Keeps the dwelling price index in the DB: reads the DB first and calls the CBS API only
 * when months are missing or the stored data is older than the refresh window. A CBS
 * outage never fails the caller – the last stored values keep being used.
 */
export class PriceIndexService {
  constructor(
    private readonly repository: PriceIndexRepository,
    private readonly cbs: CbsClient,
    private readonly logger: Logger,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async ensure(from: MonthPeriod): Promise<EnsureOutcome> {
    const stored = await this.repository.findSeries(DWELLING_PRICES_SERIES);
    const reason = this.refreshReason(stored, from);
    if (reason === null) {
      this.logger.debug({ months: stored.length }, 'Price index up to date');
      return 'up-to-date';
    }

    const today = this.now();
    const to = { year: today.getUTCFullYear(), month: today.getUTCMonth() + 1 };
    try {
      const points = keepLatestBase(
        await this.cbs.getMonthlyIndex(DWELLING_PRICES_SERIES, from, to),
      );
      await this.repository.upsertSeries(DWELLING_PRICES_SERIES, points, PROVISIONAL_MONTHS);
      this.logger.info({ reason, months: points.length }, 'Price index fetched from CBS');
      return 'fetched';
    } catch (err) {
      this.logger.warn(
        { err, reason, storedMonths: stored.length },
        'Price index fetch failed – using stored values',
      );
      return 'fetch-failed';
    }
  }

  private refreshReason(stored: readonly StoredIndexPoint[], from: MonthPeriod): string | null {
    const first = stored[0];
    if (first === undefined) {
      return 'empty';
    }
    if (first.period > toPeriod(from.year, from.month)) {
      return 'missing-early-months';
    }
    const newestFetch = Math.max(
      ...stored.map((point) => {
        return point.fetchedAt.getTime();
      }),
    );
    if (this.now().getTime() - newestFetch > REFRESH_AFTER_DAYS * MS_PER_DAY) {
      return 'stale';
    }
    return null;
  }
}

/**
 * Index values are only comparable within one base period. If CBS ever returns a range that
 * spans a base change, keep the points on the most recent base.
 */
function keepLatestBase(points: readonly IndexPoint[]): IndexPoint[] {
  const latest = points.at(-1);
  if (latest === undefined) {
    return [];
  }
  return points.filter((point) => {
    return point.baseDesc === latest.baseDesc;
  });
}
