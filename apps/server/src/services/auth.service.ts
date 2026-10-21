import { hash, verify } from '@node-rs/argon2';
import { jwtVerify, SignJWT } from 'jose';
import { normalizeEmail, type UserRepository } from '../repositories/user.repository.js';

export interface AuthUser {
  id: number;
  email: string;
  /** Set by ADMIN_EMAILS: may manage the registration code and users. */
  isAdmin: boolean;
}

export interface SessionToken {
  token: string;
  expiresAt: Date;
}

export function hashPassword(password: string): Promise<string> {
  return hash(password);
}

/** How long a "user is still active" check is served from memory before asking the DB again. */
const ACTIVE_USER_CACHE_MS = 60_000;

/**
 * Login and session tokens. Users register with the registration code (or are added with
 * `npm run user:add`). Sessions are stateless signed JWTs (HS256) carried in an httpOnly cookie.
 */
export class AuthService {
  private readonly key: Uint8Array;
  // Verifying against a real hash when the email is unknown keeps response times similar,
  // so timing does not reveal which emails exist.
  private readonly dummyHash: Promise<string>;
  private readonly activeUsers = new Map<number, { user: AuthUser | null; checkedAt: number }>();

  private readonly adminEmails: ReadonlySet<string>;

  constructor(
    private readonly users: UserRepository,
    secret: string,
    private readonly sessionTtlHours: number,
    adminEmails: readonly string[] = [],
    private readonly now: () => number = Date.now,
  ) {
    this.adminEmails = new Set(adminEmails.map(normalizeEmail));
    this.key = new TextEncoder().encode(secret);
    this.dummyHash = hash('dummy-password-for-timing-only');
  }

  /** Returns the user on valid credentials, otherwise null (never says which part was wrong). */
  async verifyCredentials(email: string, password: string): Promise<AuthUser | null> {
    const user = await this.users.findByEmail(email);
    if (user === undefined || !user.isActive) {
      await verify(await this.dummyHash, password);
      return null;
    }
    const valid = await verify(user.passwordHash, password);
    if (!valid) {
      return null;
    }
    await this.users.recordLogin(user.id);
    return this.toAuthUser(user);
  }

  async issueToken(user: AuthUser): Promise<SessionToken> {
    const expiresAt = new Date(Date.now() + this.sessionTtlHours * 3_600_000);
    const token = await new SignJWT({ email: user.email })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(String(user.id))
      .setIssuedAt()
      .setExpirationTime(expiresAt)
      .sign(this.key);
    return { token, expiresAt };
  }

  /**
   * Returns the session user, or null for a missing, invalid, expired or deactivated session.
   * A database failure is thrown, not turned into null: it is not the user's session that failed
   * (503, not 401 – a 401 would send everyone back to the login screen).
   */
  async verifyToken(token: string): Promise<AuthUser | null> {
    let subject: string | undefined;
    try {
      const { payload } = await jwtVerify(token, this.key, { algorithms: ['HS256'] });
      subject = payload.sub;
    } catch {
      return null;
    }
    const id = Number(subject);
    if (!Number.isInteger(id)) {
      return null;
    }
    return this.activeUser(id);
  }

  /**
   * Memory first, then the DB: a deactivated user is locked out within ACTIVE_USER_CACHE_MS. If
   * the DB can't be reached, the last answer is kept (the market is in memory, so the app keeps
   * working); a user never checked before gets the DB error.
   */
  private async activeUser(id: number): Promise<AuthUser | null> {
    const cached = this.activeUsers.get(id);
    if (cached !== undefined && this.now() - cached.checkedAt < ACTIVE_USER_CACHE_MS) {
      return cached.user;
    }
    let record: Awaited<ReturnType<UserRepository['findById']>>;
    try {
      record = await this.users.findById(id);
    } catch (err) {
      if (cached !== undefined) {
        return cached.user;
      }
      throw err;
    }
    const user = record === undefined || !record.isActive ? null : this.toAuthUser(record);
    this.activeUsers.set(id, { user, checkedAt: this.now() });
    return user;
  }

  /** After an administrator blocks or unblocks a user: the next request checks the DB again. */
  forget(id: number): void {
    this.activeUsers.delete(id);
  }

  toAuthUser(record: { id: number; email: string }): AuthUser {
    return { id: record.id, email: record.email, isAdmin: this.adminEmails.has(record.email) };
  }
}
