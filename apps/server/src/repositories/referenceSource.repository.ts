import { eq, sql } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { referenceSources } from '../db/schema.js';
import { excludedSet } from './upsertHelpers.js';

export type ReferenceSourceState = typeof referenceSources.$inferSelect;

export class ReferenceSourceRepository {
  constructor(private readonly db: Database) {}

  async get(key: string): Promise<ReferenceSourceState | undefined> {
    const [row] = await this.db
      .select()
      .from(referenceSources)
      .where(eq(referenceSources.key, key));
    return row;
  }

  /** Records that a source was (re)loaded from a specific published file. */
  async recordLoad(
    key: string,
    resourceId: string,
    sourceModifiedAt: string | null,
  ): Promise<void> {
    await this.db
      .insert(referenceSources)
      .values({
        key,
        resourceId,
        sourceModifiedAt,
        checkedAt: sql`now()`,
        loadedAt: sql`now()`,
      })
      .onConflictDoUpdate({
        target: referenceSources.key,
        set: excludedSet(referenceSources, [
          'resourceId',
          'sourceModifiedAt',
          'checkedAt',
          'loadedAt',
        ]),
      });
  }

  /** Records that a check found nothing new. */
  async recordCheck(key: string): Promise<void> {
    await this.db
      .update(referenceSources)
      .set({ checkedAt: sql`now()` })
      .where(eq(referenceSources.key, key));
  }
}
