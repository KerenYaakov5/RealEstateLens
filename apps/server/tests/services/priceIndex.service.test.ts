import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CbsClient, IndexPoint } from '../../src/clients/cbs/cbsClient.js';
import { createDatabase, type DatabaseHandle } from '../../src/db/client.js';
import { logger } from '../../src/lib/logger.js';
import { PriceIndexRepository } from '../../src/repositories/priceIndex.repository.js';
import { PriceIndexService } from '../../src/services/priceIndex.service.js';

const POINTS: IndexPoint[] = [
  { year: 2026, month: 3, value: 599.6, baseDesc: 'Average 1993' },
  { year: 2026, month: 4, value: 592.4, baseDesc: 'Average 1993' },
  { year: 2026, month: 5, value: 593.0, baseDesc: 'Average 1993' },
  { year: 2026, month: 6, value: 593.6, baseDesc: 'Average 1993' },
  { year: 2026, month: 7, value: 590.0, baseDesc: 'Average 1993' },
];

let handle: DatabaseHandle;
let repository: PriceIndexRepository;

function fakeCbs(impl: () => Promise<IndexPoint[]>): { cbs: CbsClient; calls: () => number } {
  const getMonthlyIndex = vi.fn(impl);
  return {
    cbs: { getMonthlyIndex } as unknown as CbsClient,
    calls: () => getMonthlyIndex.mock.calls.length,
  };
}

const from = { year: 2026, month: 3 };

beforeEach(async () => {
  handle = createDatabase({ pgliteDataDir: 'memory://', logger });
  await handle.migrate();
  repository = new PriceIndexRepository(handle.db);
}, 60_000);

afterEach(async () => {
  await handle.close();
});

describe('PriceIndexService.ensure', () => {
  it('fetches from CBS when the DB is empty and flags the last 3 months as provisional', async () => {
    const { cbs, calls } = fakeCbs(async () => POINTS);
    const service = new PriceIndexService(repository, cbs, logger);

    await expect(service.ensure(from)).resolves.toBe('fetched');

    const stored = await repository.findSeries(40010);
    expect(calls()).toBe(1);
    expect(stored.map((p) => [p.period, p.value, p.isProvisional])).toEqual([
      ['2026-03-01', 599.6, false],
      ['2026-04-01', 592.4, false],
      ['2026-05-01', 593.0, true],
      ['2026-06-01', 593.6, true],
      ['2026-07-01', 590.0, true],
    ]);
  });

  it('does not call CBS when the stored data is fresh and covers the range', async () => {
    const first = fakeCbs(async () => POINTS);
    await new PriceIndexService(repository, first.cbs, logger).ensure(from);

    const second = fakeCbs(async () => POINTS);
    await expect(new PriceIndexService(repository, second.cbs, logger).ensure(from)).resolves.toBe(
      'up-to-date',
    );
    expect(second.calls()).toBe(0);
  });

  it('refetches when earlier months are needed than what is stored', async () => {
    await new PriceIndexService(repository, fakeCbs(async () => POINTS).cbs, logger).ensure(from);

    const again = fakeCbs(async () => POINTS);
    await new PriceIndexService(repository, again.cbs, logger).ensure({ year: 2021, month: 1 });

    expect(again.calls()).toBe(1);
  });

  it('refetches when the stored data is older than 30 days', async () => {
    await new PriceIndexService(repository, fakeCbs(async () => POINTS).cbs, logger).ensure(from);

    const inFiveWeeks = () => new Date(Date.now() + 35 * 86_400_000);
    const later = fakeCbs(async () => POINTS);
    await expect(
      new PriceIndexService(repository, later.cbs, logger, inFiveWeeks).ensure(from),
    ).resolves.toBe('fetched');
  });

  it('keeps working on stored values when CBS is unavailable', async () => {
    await new PriceIndexService(repository, fakeCbs(async () => POINTS).cbs, logger).ensure(from);

    const failing = fakeCbs(async () => {
      throw new Error('CBS down');
    });
    const outcome = await new PriceIndexService(repository, failing.cbs, logger).ensure({
      year: 2021,
      month: 1,
    });

    expect(outcome).toBe('fetch-failed');
    expect(await repository.findSeries(40010)).toHaveLength(5);
  });

  it('keeps only points on the latest base if CBS returns a base change', async () => {
    const oldBase: IndexPoint = { year: 2026, month: 2, value: 602.0, baseDesc: 'Average 1993' };
    const newBase = POINTS.map((point) => {
      return { ...point, value: point.value / 5, baseDesc: 'Average 2024' };
    });
    const service = new PriceIndexService(
      repository,
      fakeCbs(async () => [oldBase, ...newBase]).cbs,
      logger,
    );

    await service.ensure({ year: 2026, month: 2 });

    const stored = await repository.findSeries(40010);
    expect(stored.every((p) => p.baseDesc === 'Average 2024')).toBe(true);
    expect(stored).toHaveLength(5);
  });
});
