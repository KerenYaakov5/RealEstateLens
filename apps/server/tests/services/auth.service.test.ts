import { describe, expect, it } from 'vitest';
import type { UserRecord, UserRepository } from '../../src/repositories/user.repository.js';
import { AuthService } from '../../src/services/auth.service.js';

const SECRET = 'test-secret-that-is-at-least-32-characters-long';

const USER: UserRecord = {
  id: 7,
  email: 'dana@example.com',
  passwordHash: 'unused',
  isActive: true,
  lastLoginAt: null,
  registrationCodeId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

/** A user repository whose database can be switched off. */
function fakeUsers() {
  const state = { databaseDown: false, lookups: 0 };
  const repository = {
    findById: (id: number) => {
      state.lookups++;
      if (state.databaseDown) {
        return Promise.reject(new Error('connect ECONNREFUSED'));
      }
      return Promise.resolve(id === USER.id ? USER : undefined);
    },
  } as unknown as UserRepository;
  return { repository, state };
}

describe('AuthService.verifyToken', () => {
  it('returns the user for a valid token and null for a forged one', async () => {
    const { repository } = fakeUsers();
    const auth = new AuthService(repository, SECRET, 24);
    const { token } = await auth.issueToken({ id: USER.id, email: USER.email, isAdmin: false });

    await expect(auth.verifyToken(token)).resolves.toMatchObject({ id: USER.id });
    await expect(auth.verifyToken(`${token}x`)).resolves.toBeNull();
    await expect(auth.verifyToken('not-a-jwt')).resolves.toBeNull();
  });

  it('throws when the database is down for a user never checked – a 503, not "logged out"', async () => {
    const { repository, state } = fakeUsers();
    const auth = new AuthService(repository, SECRET, 24);
    const { token } = await auth.issueToken({ id: USER.id, email: USER.email, isAdmin: false });
    state.databaseDown = true;

    await expect(auth.verifyToken(token)).rejects.toThrow('ECONNREFUSED');
  });

  it('keeps serving the last known answer while the database is down', async () => {
    let now = 0;
    const { repository, state } = fakeUsers();
    const auth = new AuthService(repository, SECRET, 24, [], () => now);
    const { token } = await auth.issueToken({ id: USER.id, email: USER.email, isAdmin: false });
    await auth.verifyToken(token);

    now = 120_000; // past the 60 s memory window – the DB is asked again
    state.databaseDown = true;

    await expect(auth.verifyToken(token)).resolves.toMatchObject({ id: USER.id });
    expect(state.lookups).toBe(2);
  });
});
