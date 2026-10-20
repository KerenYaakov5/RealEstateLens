import type { RecommendationPickDto } from '@rel/shared';
import { eq } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { aiCache } from '../db/schema.js';

export interface CachedAnswer {
  picks: RecommendationPickDto[];
  provider: string;
  model: string;
}

export class AiCacheRepository {
  constructor(private readonly db: Database) {}

  async get(key: string): Promise<CachedAnswer | undefined> {
    const [row] = await this.db
      .select({ picks: aiCache.picks, provider: aiCache.provider, model: aiCache.model })
      .from(aiCache)
      .where(eq(aiCache.key, key));
    return row;
  }

  /** Idempotent: two users asking the same question at once store one row. */
  async set(key: string, promptVersion: number, answer: CachedAnswer): Promise<void> {
    await this.db
      .insert(aiCache)
      .values({ key, promptVersion, ...answer })
      .onConflictDoNothing({ target: aiCache.key });
  }
}
