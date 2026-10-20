import { and, eq, isNull, sql } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { registrationCodes } from '../db/schema.js';

export type RegistrationCodeRecord = typeof registrationCodes.$inferSelect;

export interface NewRegistrationCode {
  codeHash: string;
  codeEncrypted: string;
  hint: string;
  createdByUserId: number;
}

export class RegistrationCodeRepository {
  constructor(private readonly db: Database) {}

  async active(): Promise<RegistrationCodeRecord | undefined> {
    const [row] = await this.db
      .select()
      .from(registrationCodes)
      .where(isNull(registrationCodes.disabledAt));
    return row;
  }

  /** The new code becomes the only active one; the old one stops working in the same step. */
  async replace(code: NewRegistrationCode): Promise<RegistrationCodeRecord> {
    return this.db.transaction(async (tx) => {
      await disableActive(tx);
      const [row] = await tx.insert(registrationCodes).values(code).returning();
      if (row === undefined) {
        throw new Error('Failed to create registration code');
      }
      return row;
    });
  }

  /** Stops registration until a new code is created. */
  async disable(): Promise<void> {
    await disableActive(this.db);
  }
}

function disableActive(db: Database) {
  return db
    .update(registrationCodes)
    .set({ disabledAt: sql`now()`, updatedAt: sql`now()` })
    .where(isNull(registrationCodes.disabledAt));
}

/**
 * Counts one registration with the code, if it is the active one. Returns the code's id, or
 * null when the code is wrong or was replaced. Runs inside the registration's transaction.
 */
export async function useRegistrationCode(db: Database, codeHash: string): Promise<number | null> {
  const [row] = await db
    .update(registrationCodes)
    .set({ usedCount: sql`${registrationCodes.usedCount} + 1`, updatedAt: sql`now()` })
    .where(and(eq(registrationCodes.codeHash, codeHash), isNull(registrationCodes.disabledAt)))
    .returning({ id: registrationCodes.id });
  return row?.id ?? null;
}
