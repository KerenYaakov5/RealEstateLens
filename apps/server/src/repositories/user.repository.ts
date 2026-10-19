import { eq, sql } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { users } from '../db/schema.js';

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

  /** For tests and tooling only – production users are inserted manually. */
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
