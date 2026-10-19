import type { Express } from 'express';
import request from 'supertest';
import { createApp, type AppOptions } from '../../src/app.js';
import { createDatabase, type DatabaseHandle } from '../../src/db/client.js';
import { logger } from '../../src/lib/logger.js';
import { UserRepository } from '../../src/repositories/user.repository.js';
import { AuthService, hashPassword } from '../../src/services/auth.service.js';

export const TEST_USER = { email: 'tester@example.com', password: 'correct-horse-battery' };
const TEST_SECRET = 'test-secret-that-is-at-least-32-characters-long';

export interface TestApp {
  app: Express;
  handle: DatabaseHandle;
  users: UserRepository;
  close(): Promise<void>;
}

/** An app on a fresh in-memory database with one active test user. */
export async function createTestApp(overrides: Partial<AppOptions> = {}): Promise<TestApp> {
  const handle = createDatabase({ pgliteDataDir: 'memory://', logger });
  await handle.migrate();
  const users = new UserRepository(handle.db);
  await users.create(TEST_USER.email, await hashPassword(TEST_USER.password));

  const app = createApp({
    auth: new AuthService(users, TEST_SECRET, 24),
    options: {
      secureCookies: false,
      trustProxy: false,
      rateLimitPerMinute: 1000,
      loginMaxAttempts: 5,
      loginWindowMinutes: 15,
      ...overrides,
    },
  });
  return { app, handle, users, close: () => handle.close() };
}

/** Logs in and returns the session cookie header value. */
export async function loginCookie(app: Express): Promise<string> {
  const res = await request(app).post('/api/v1/sessions').send(TEST_USER);
  const cookie = res.headers['set-cookie']?.[0];
  if (res.status !== 201 || cookie === undefined) {
    throw new Error(`login failed with ${res.status}`);
  }
  return cookie.split(';')[0] ?? '';
}
