import { eq, sql } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { importIssues, importRuns } from '../db/schema.js';
import { chunk } from './upsertHelpers.js';

export type ImportIssue = Omit<typeof importIssues.$inferInsert, 'id' | 'runId'>;

export interface ImportRunStats {
  rowsRead: number;
  dealsUpserted: number;
  rowsRejected: number;
  duplicatesRemoved: number;
  warnings: number;
}

export class ImportRunRepository {
  constructor(private readonly db: Database) {}

  async start(sourceFile: string): Promise<number> {
    const [row] = await this.db
      .insert(importRuns)
      .values({ sourceFile })
      .returning({ id: importRuns.id });
    if (row === undefined) {
      throw new Error('Failed to create import run');
    }
    return row.id;
  }

  async addIssues(runId: number, issues: readonly ImportIssue[]): Promise<void> {
    for (const batch of chunk(issues, 200)) {
      await this.db.insert(importIssues).values(
        batch.map((issue) => {
          return { ...issue, runId };
        }),
      );
    }
  }

  async finish(runId: number, stats: ImportRunStats): Promise<void> {
    await this.db
      .update(importRuns)
      .set({ ...stats, finishedAt: sql`now()` })
      .where(eq(importRuns.id, runId));
  }
}
