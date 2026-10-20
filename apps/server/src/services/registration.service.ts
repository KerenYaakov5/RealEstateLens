import type { RegistrationRequest } from '@rel/shared';
import type { Database } from '../db/client.js';
import { users } from '../db/schema.js';
import { AppError } from '../errors/AppError.js';
import { consumeInviteCode } from '../repositories/inviteCode.repository.js';
import { normalizeEmail } from '../repositories/user.repository.js';
import { hashPassword, type AuthService, type AuthUser } from './auth.service.js';
import { hashInviteCode } from './inviteCodes.js';

const INVALID_CODE = new AppError(
  400,
  'INVALID_INVITE_CODE',
  'קוד ההזמנה אינו תקף: ייתכן שהוקלד לא נכון, שכבר נוצל או שפג תוקפו',
);

/**
 * Self-registration with an invite code. Taking a use of the code and creating the user happen
 * in one transaction: if the user cannot be created (e.g. the email exists), the use is
 * returned to the code.
 */
export class RegistrationService {
  constructor(
    private readonly db: Database,
    private readonly auth: AuthService,
  ) {}

  async register(request: RegistrationRequest): Promise<AuthUser> {
    const email = normalizeEmail(request.email);
    // Hashing is slow on purpose – do it before the transaction holds any lock.
    const passwordHash = await hashPassword(request.password);

    const record = await this.db.transaction(async (tx) => {
      const inviteCodeId = await consumeInviteCode(tx, hashInviteCode(request.inviteCode));
      if (inviteCodeId === null) {
        throw INVALID_CODE;
      }
      // Checked only after a valid code, so the form cannot be used to probe for emails.
      const existing = await tx.query.users.findFirst({
        where: (table, { eq }) => eq(table.email, email),
        columns: { id: true },
      });
      if (existing !== undefined) {
        throw AppError.conflict('כבר קיים משתמש עם האימייל הזה. אפשר להתחבר במסך הכניסה.');
      }
      const [created] = await tx
        .insert(users)
        .values({ email, passwordHash, inviteCodeId, lastLoginAt: new Date() })
        .returning();
      if (created === undefined) {
        throw new Error('Failed to create user');
      }
      return created;
    });
    return this.auth.toAuthUser(record);
  }
}
