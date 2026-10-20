import { and, desc, eq, sql } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { aiUsage, inviteCodes, users } from '../db/schema.js';

export type UserRecord = typeof users.$inferSelect;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export class UserRepository {
  constructor(private readonly db: Database) {}

  async findByEmail(email: string): Promise<UserRecord | undefined> {
    const [row] = await this.db
      .select()
      .from(users)
      .where(eq(users.email, normalizeEmail(email)));
    return row;
  }

  async findById(id: number): Promise<UserRecord | undefined> {
    const [row] = await this.db.select().from(users).where(eq(users.id, id));
    return row;
  }

  async recordLogin(id: number): Promise<void> {
    await this.db
      .update(users)
      .set({ lastLoginAt: sql`now()` })
      .where(eq(users.id, id));
  }

  async setActive(id: number, isActive: boolean): Promise<UserRecord | undefined> {
    const [row] = await this.db
      .update(users)
      .set({ isActive, updatedAt: sql`now()` })
      .where(eq(users.id, id))
      .returning();
    return row;
  }

  /** Every user with the invite code they came with and their AI use on `day` (YYYY-MM-DD). */
  listForAdmin(day: string) {
    return this.db
      .select({
        id: users.id,
        email: users.email,
        isActive: users.isActive,
        createdAt: users.createdAt,
        lastLoginAt: users.lastLoginAt,
        invitedWith: inviteCodes.label,
        aiRecommendationsToday: sql<number>`coalesce(${aiUsage.recommendations}, 0)::int`,
      })
      .from(users)
      .leftJoin(inviteCodes, eq(inviteCodes.id, users.inviteCodeId))
      .leftJoin(aiUsage, and(eq(aiUsage.userId, users.id), eq(aiUsage.day, day)))
      .orderBy(desc(users.createdAt));
  }

  /** For tests and tooling (`npm run user:add`). */
  async create(email: string, passwordHash: string): Promise<UserRecord> {
    const [row] = await this.db
      .insert(users)
      .values({ email: normalizeEmail(email), passwordHash })
      .returning();
    if (row === undefined) {
      throw new Error('Failed to create user');
    }
    return row;
  }
}
