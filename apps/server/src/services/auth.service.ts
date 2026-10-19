import { hash, verify } from '@node-rs/argon2';
import { jwtVerify, SignJWT } from 'jose';
import type { UserRepository } from '../repositories/user.repository.js';

export interface AuthUser {
  id: number;
  email: string;
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
 * Login and session tokens. Users are added manually; there is no sign-up.
 * Sessions are stateless signed JWTs (HS256) carried in an httpOnly cookie.
 */
export class AuthService {
  private readonly key: Uint8Array;
  // Verifying against a real hash when the email is unknown keeps response times similar,
  // so timing does not reveal which emails exist.
  private readonly dummyHash: Promise<string>;
  private readonly activeUsers = new Map<number, { user: AuthUser | null; checkedAt: number }>();

  constructor(
    private readonly users: UserRepository,
    secret: string,
    private readonly sessionTtlHours: number,
    private readonly now: () => number = Date.now,
  ) {
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
    return { id: user.id, email: user.email };
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

  /** Returns the session user, or null for a missing, invalid, expired or deactivated session. */
  async verifyToken(token: string): Promise<AuthUser | null> {
    try {
      const { payload } = await jwtVerify(token, this.key, { algorithms: ['HS256'] });
      const id = Number(payload.sub);
      if (!Number.isInteger(id)) {
        return null;
      }
      return await this.activeUser(id);
    } catch {
      return null;
    }
  }

  /** Memory first, then the DB: a deactivated user is locked out within ACTIVE_USER_CACHE_MS. */
  private async activeUser(id: number): Promise<AuthUser | null> {
    const cached = this.activeUsers.get(id);
    if (cached !== undefined && this.now() - cached.checkedAt < ACTIVE_USER_CACHE_MS) {
      return cached.user;
    }
    const record = await this.users.findById(id);
    const user =
      record === undefined || !record.isActive ? null : { id: record.id, email: record.email };
    this.activeUsers.set(id, { user, checkedAt: this.now() });
    return user;
  }
}
