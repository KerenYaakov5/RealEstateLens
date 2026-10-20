import type { RegistrationRequest } from '@rel/shared';
import type { Database } from '../db/client.js';
import { users } from '../db/schema.js';
import { AppError } from '../errors/AppError.js';
import { useRegistrationCode } from '../repositories/registrationCode.repository.js';
import { normalizeEmail } from '../repositories/user.repository.js';
import { hashPassword, type AuthService, type AuthUser } from './auth.service.js';
import { hashRegistrationCode } from './registrationCode.js';

const WRONG_CODE = new AppError(
  400,
  'INVALID_REGISTRATION_CODE',
  'קוד ההרשמה שגוי. בדקו את הקוד שקיבלתם ממנהל המערכת.',
);

/**
 * Self-registration with the registration code. Counting the code's use and creating the user
 * are one transaction: if the user cannot be created (e.g. the email exists), nothing changes.
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
      const registrationCodeId = await useRegistrationCode(
        tx,
        hashRegistrationCode(request.registrationCode),
      );
      if (registrationCodeId === null) {
        throw WRONG_CODE;
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
        .values({ email, passwordHash, registrationCodeId, lastLoginAt: new Date() })
        .returning();
      if (created === undefined) {
        throw new Error('Failed to create user');
      }
      return created;
    });
    return this.auth.toAuthUser(record);
  }
}
