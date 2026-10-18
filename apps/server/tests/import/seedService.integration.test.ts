import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { count, eq, isNull } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, type DatabaseHandle } from '../../src/db/client.js';
import { cities, deals, importIssues, importRuns, neighborhoods } from '../../src/db/schema.js';
import { ensureSeeded, seedDeals } from '../../src/import/seedService.js';
import { logger } from '../../src/lib/logger.js';

const seedFile = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../data/madlan-sample.xlsx',
);
const today = new Date('2026-10-18T00:00:00Z');

let handle: DatabaseHandle;

async function countRows(
  table: typeof deals | typeof cities | typeof neighborhoods,
): Promise<number> {
  const [row] = await handle.db.select({ value: count() }).from(table);
  return row?.value ?? 0;
}

beforeAll(async () => {
  handle = createDatabase({ pgliteDataDir: 'memory://', logger });
  await handle.migrate();
}, 60_000);

afterAll(async () => {
  await handle.close();
});

describe('seedDeals (PGlite)', () => {
  it('imports the spreadsheet and records the run', async () => {
    const result = await seedDeals({ db: handle.db, filePath: seedFile, logger, today });

    expect(result).toMatchObject({
      rowsRead: 530,
      dealsUpserted: 518,
      rowsRejected: 2,
      duplicatesRemoved: 10,
      warnings: 28,
    });
    expect(await countRows(deals)).toBe(518);
    expect(await countRows(cities)).toBe(18);
    expect(await countRows(neighborhoods)).toBeGreaterThan(50);

    const issues = await handle.db
      .select({ severity: importIssues.severity, value: count() })
      .from(importIssues)
      .where(eq(importIssues.runId, result.runId))
      .groupBy(importIssues.severity);

    expect(Object.fromEntries(issues.map((row) => [row.severity, row.value]))).toEqual({
      error: 2,
      duplicate: 10,
      warning: 28,
    });
  }, 60_000);

  it('stores unknown values as NULL', async () => {
    const [row] = await handle.db
      .select({ value: count() })
      .from(deals)
      .where(isNull(deals.hasParking));

    expect(row?.value).toBeGreaterThan(0);
  });

  it('is idempotent – a second run does not duplicate deals', async () => {
    await seedDeals({ db: handle.db, filePath: seedFile, logger, today });

    expect(await countRows(deals)).toBe(518);
    expect(await countRows(cities)).toBe(18);

    const [runs] = await handle.db.select({ value: count() }).from(importRuns);
    expect(runs?.value).toBe(2);
  }, 60_000);

  it('ensureSeeded skips a populated table', async () => {
    expect(await ensureSeeded({ db: handle.db, filePath: seedFile, logger, today })).toBeNull();
  });

  it('ensureSeeded refills the table after it was wiped', async () => {
    await handle.db.delete(deals);
    expect(await countRows(deals)).toBe(0);

    const result = await ensureSeeded({ db: handle.db, filePath: seedFile, logger, today });

    expect(result?.dealsUpserted).toBe(518);
    expect(await countRows(deals)).toBe(518);
  }, 60_000);
});
