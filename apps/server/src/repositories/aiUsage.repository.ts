import { and, eq, sql } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { aiUsage } from '../db/schema.js';

export interface UsageIncrement {
  recommendations: number;
  llmCalls: number;
  inputTokens: number;
  outputTokens: number;
}

export class AiUsageRepository {
  constructor(private readonly db: Database) {}

  /** Personal recommendations the user got on `day` (YYYY-MM-DD). */
  async recommendationsOn(userId: number, day: string): Promise<number> {
    const [row] = await this.db
      .select({ recommendations: aiUsage.recommendations })
      .from(aiUsage)
      .where(and(eq(aiUsage.userId, userId), eq(aiUsage.day, day)));
    return row?.recommendations ?? 0;
  }

  /** Model calls by all users on `day` – the global cost ceiling. */
  async llmCallsOn(day: string): Promise<number> {
    const [row] = await this.db
      .select({ calls: sql<number>`coalesce(sum(${aiUsage.llmCalls}), 0)::int` })
      .from(aiUsage)
      .where(eq(aiUsage.day, day));
    return row?.calls ?? 0;
  }

  /** Adds to the day's counters in one atomic upsert (safe under concurrent requests). */
  async add(userId: number, day: string, increment: UsageIncrement): Promise<void> {
    await this.db
      .insert(aiUsage)
      .values({ userId, day, ...increment })
      .onConflictDoUpdate({
        target: [aiUsage.userId, aiUsage.day],
        set: {
          recommendations: sql`${aiUsage.recommendations} + ${increment.recommendations}`,
          llmCalls: sql`${aiUsage.llmCalls} + ${increment.llmCalls}`,
          inputTokens: sql`${aiUsage.inputTokens} + ${increment.inputTokens}`,
          outputTokens: sql`${aiUsage.outputTokens} + ${increment.outputTokens}`,
        },
      });
  }
}
