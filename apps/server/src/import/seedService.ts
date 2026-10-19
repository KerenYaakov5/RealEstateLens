import path from 'node:path';
import { CITY_REFERENCES } from '../data/cities.js';
import type { Database } from '../db/client.js';
import type { Logger } from '../lib/logger.js';
import { CityRepository } from '../repositories/city.repository.js';
import { DealRepository, type NewDeal } from '../repositories/deal.repository.js';
import {
  ImportRunRepository,
  type ImportIssue,
  type ImportRunStats,
} from '../repositories/importRun.repository.js';
import {
  NeighborhoodRepository,
  neighborhoodRowKey,
} from '../repositories/neighborhood.repository.js';
import { dedupeDeals } from './dedupe.js';
import { readSpreadsheet } from './excelReader.js';
import { CityMatcher } from './normalizers/location.js';
import { mapRow, type NormalizedDeal } from './rowMapper.js';

export interface SeedOptions {
  db: Database;
  filePath: string;
  logger: Logger;
  today?: Date;
}

export interface SeedResult extends ImportRunStats {
  runId: number;
}

/**
 * Imports the spreadsheet into the database. Idempotent: deals are upserted by deal_id,
 * so running it again refreshes the same rows instead of duplicating them.
 * Every run is recorded in import_runs, with rejected rows, warnings and duplicates
 * in import_issues.
 */
export async function seedDeals(options: SeedOptions): Promise<SeedResult> {
  const { db, filePath, logger } = options;
  const today = options.today ?? new Date();
  const log = logger.child({ component: 'seed', file: path.basename(filePath) });

  log.info('Reading seed spreadsheet');
  const rows = await readSpreadsheet(filePath);

  const cityMatcher = new CityMatcher(CITY_REFERENCES);
  const issues: ImportIssue[] = [];
  const validDeals: NormalizedDeal[] = [];

  for (const row of rows) {
    const outcome = mapRow(row.values, row.rowNumber, cityMatcher, today);
    const dealId = outcome.ok ? outcome.deal.dealId : outcome.dealId;
    for (const warning of outcome.warnings) {
      issues.push({ severity: 'warning', rowNumber: row.rowNumber, dealId, message: warning });
    }
    if (outcome.ok) {
      validDeals.push(outcome.deal);
    } else {
      issues.push({
        severity: 'error',
        rowNumber: row.rowNumber,
        dealId,
        message: outcome.errors.join('; '),
      });
    }
  }

  const { kept, rejected } = dedupeDeals(validDeals);
  for (const duplicate of rejected) {
    issues.push({
      severity: 'duplicate',
      rowNumber: duplicate.deal.rowNumber,
      dealId: duplicate.deal.dealId,
      message: duplicate.reason,
    });
  }

  const stats: ImportRunStats = {
    rowsRead: rows.length,
    dealsUpserted: 0,
    rowsRejected: rows.length - validDeals.length,
    duplicatesRemoved: rejected.length,
    warnings: issues.filter((issue) => {
      return issue.severity === 'warning';
    }).length,
  };

  const runId = await db.transaction(async (tx) => {
    const cityIds = await new CityRepository(tx).upsertReferenceCities(CITY_REFERENCES);
    const neighborhoodIds = await new NeighborhoodRepository(tx).ensure(
      kept.flatMap((deal) => {
        const cityId = cityIds.get(deal.cityKey);
        return cityId === undefined || deal.neighborhood === null
          ? []
          : [{ cityId, name: deal.neighborhood }];
      }),
    );

    const dealRows = kept.map((deal): NewDeal => {
      const cityId = cityIds.get(deal.cityKey);
      if (cityId === undefined) {
        throw new Error(`City ${deal.cityKey} missing after upsert`);
      }
      const neighborhoodId =
        deal.neighborhood === null
          ? null
          : (neighborhoodIds.get(neighborhoodRowKey({ cityId, name: deal.neighborhood })) ?? null);
      return {
        dealId: deal.dealId,
        cityId,
        neighborhoodId,
        street: deal.street,
        propertyType: deal.propertyType,
        rooms: deal.rooms,
        sizeSqm: deal.sizeSqm,
        floor: deal.floor,
        totalFloors: deal.totalFloors,
        yearBuilt: deal.yearBuilt,
        condition: deal.condition,
        hasElevator: deal.hasElevator,
        hasParking: deal.hasParking,
        hasBalcony: deal.hasBalcony,
        hasSafeRoom: deal.hasSafeRoom,
        dealDate: deal.dealDate,
        priceNis: deal.priceNis,
        pricePerSqm: deal.pricePerSqm,
        sourcePricePerSqm: deal.sourcePricePerSqm,
        source: deal.source,
        sourceRow: deal.rowNumber,
      };
    });

    stats.dealsUpserted = await new DealRepository(tx).upsertMany(dealRows);

    const runs = new ImportRunRepository(tx);
    const id = await runs.start(path.basename(filePath));
    await runs.addIssues(id, issues);
    await runs.finish(id, stats);
    return id;
  });

  log.info({ runId, ...stats }, 'Seed finished');
  return { runId, ...stats };
}

/** Seeds only when the deals table is empty (first start, or after the table was wiped). */
export async function ensureSeeded(options: SeedOptions): Promise<SeedResult | null> {
  const existing = await new DealRepository(options.db).count();
  if (existing > 0) {
    options.logger.info({ deals: existing }, 'Deals table already populated – skipping seed');
    return null;
  }
  options.logger.warn('Deals table is empty – running seed');
  return seedDeals(options);
}
