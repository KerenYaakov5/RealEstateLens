import { desc, eq, sql } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { inviteCodes } from '../db/schema.js';

export type InviteCodeRecord = typeof inviteCodes.$inferSelect;

export interface NewInviteCode {
  codeHash: string;
  hint: string;
  label: string;
  maxUses: number;
  expiresAt: Date | null;
  createdByUserId: number;
}

export class InviteCodeRepository {
  constructor(private readonly db: Database) {}

  async create(code: NewInviteCode): Promise<InviteCodeRecord> {
    const [row] = await this.db.insert(inviteCodes).values(code).returning();
    if (row === undefined) {
      throw new Error('Failed to create invite code');
    }
    return row;
  }

  list(): Promise<InviteCodeRecord[]> {
    return this.db.select().from(inviteCodes).orderBy(desc(inviteCodes.createdAt));
  }

  async setDisabled(id: number, disabled: boolean): Promise<InviteCodeRecord | undefined> {
    const [row] = await this.db
      .update(inviteCodes)
      .set({ disabledAt: disabled ? sql`now()` : null, updatedAt: sql`now()` })
      .where(eq(inviteCodes.id, id))
      .returning();
    return row;
  }
}

/**
 * Takes one use of a code, atomically: a single UPDATE that succeeds only while the code is
 * enabled, unexpired and not used up – two people can never both take its last use.
 * Returns the code's id, or null when it cannot be used.
 */
export async function consumeInviteCode(db: Database, codeHash: string): Promise<number | null> {
  const [row] = await db
    .update(inviteCodes)
    .set({ usedCount: sql`${inviteCodes.usedCount} + 1`, updatedAt: sql`now()` })
    .where(
      sql`${inviteCodes.codeHash} = ${codeHash}
        and ${inviteCodes.disabledAt} is null
        and (${inviteCodes.expiresAt} is null or ${inviteCodes.expiresAt} > now())
        and ${inviteCodes.usedCount} < ${inviteCodes.maxUses}`,
    )
    .returning({ id: inviteCodes.id });
  return row?.id ?? null;
}
