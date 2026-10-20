import type { AdminUserDto, LogPageDto, RegistrationCodeDto } from '@rel/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registrationCodes } from '../../src/db/schema.js';
import { AppLogRepository } from '../../src/repositories/appLog.repository.js';
import { hashPassword } from '../../src/services/auth.service.js';
import {
  generateRegistrationCode,
  normalizeRegistrationCode,
  RegistrationCodeVault,
} from '../../src/services/registrationCode.js';
import { createTestApp, loginCookie, TEST_USER, type TestApp } from './testApp.js';

const ADMIN = { email: 'admin@example.com', password: 'admin-password-123' };

let testApp: TestApp;
let adminCookie: string;
let userCookie: string;

function cookieFrom(res: request.Response): string {
  return (res.headers['set-cookie']?.[0] ?? '').split(';')[0] ?? '';
}

function asAdmin(method: 'get' | 'post' | 'delete', path: string) {
  return request(testApp.app)[method](`/api/v1${path}`).set('cookie', adminCookie);
}

async function replaceCode(): Promise<string> {
  return ((await asAdmin('post', '/registration-code')).body as RegistrationCodeDto).code;
}

function register(email: string, registrationCode: string, password = 'a-good-password-1') {
  return request(testApp.app).post('/api/v1/users').send({ email, password, registrationCode });
}

async function userIdOf(email: string): Promise<number> {
  const list = (await asAdmin('get', '/users')).body as { data: AdminUserDto[] };
  return list.data.find((user) => user.email === email)?.id ?? 0;
}

beforeAll(async () => {
  testApp = await createTestApp({ adminEmails: [ADMIN.email] });
  await testApp.users.create(ADMIN.email, await hashPassword(ADMIN.password));
  adminCookie = cookieFrom(await request(testApp.app).post('/api/v1/sessions').send(ADMIN));
  userCookie = await loginCookie(testApp.app);
}, 120_000);

afterAll(async () => {
  await testApp.close();
});

describe('registration code (administrators only)', () => {
  it('is hidden from guests (401) and regular users (403)', async () => {
    expect((await request(testApp.app).get('/api/v1/registration-code')).status).toBe(401);
    for (const path of ['/api/v1/registration-code', '/api/v1/users']) {
      expect((await request(testApp.app).get(path).set('cookie', userCookie)).status).toBe(403);
    }
  });

  it('marks the administrator in /users/me', async () => {
    const me = await request(testApp.app).get('/api/v1/users/me').set('cookie', adminCookie);
    expect(me.body).toMatchObject({ email: ADMIN.email, isAdmin: true });
  });

  it('starts with registration closed (204), then shows the same code every time', async () => {
    expect((await asAdmin('get', '/registration-code')).status).toBe(204);

    const created = await replaceCode();
    expect(created).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    const again = (await asAdmin('get', '/registration-code')).body as RegistrationCodeDto;
    expect(again).toMatchObject({ code: created, usedCount: 0 });
  });

  it('stores the code encrypted and hashed, never in plain text', async () => {
    const code = await replaceCode();
    const rows = JSON.stringify(await testApp.handle.db.select().from(registrationCodes));

    expect(rows).not.toContain(normalizeRegistrationCode(code));
    expect(rows).not.toContain(code);
  });
});

describe('POST /api/v1/users – registration', () => {
  it('registers with the permanent code – any number of people – and logs them in', async () => {
    const code = await replaceCode();

    const first = await register('first@example.com', code);
    const second = await register('second@example.com', code);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.body).toEqual({ user: { email: 'first@example.com', isAdmin: false } });
    const me = await request(testApp.app).get('/api/v1/users/me').set('cookie', cookieFrom(first));
    expect(me.status).toBe(200);
    const status = (await asAdmin('get', '/registration-code')).body as RegistrationCodeDto;
    expect(status.usedCount).toBe(2);
  });

  it('accepts the code in lower case, without dashes, with spaces around', async () => {
    const code = await replaceCode();
    const typed = ` ${code.replaceAll('-', '').toLowerCase()} `;

    expect((await register('typed@example.com', typed)).status).toBe(201);
  });

  it('a replaced code stops working at once; the new one works', async () => {
    const old = await replaceCode();
    const current = await replaceCode();

    const res = await register('late@example.com', old);
    expect(res.status).toBe(400);
    expect((res.body as { error: { code: string } }).error.code).toBe('INVALID_REGISTRATION_CODE');
    expect((await register('late@example.com', current)).status).toBe(201);
  });

  it('closing registration stops every code until a new one is created', async () => {
    const code = await replaceCode();
    expect((await asAdmin('delete', '/registration-code')).status).toBe(204);

    expect((await register('closed@example.com', code)).status).toBe(400);
    expect((await asAdmin('get', '/registration-code')).status).toBe(204);
    expect((await register('closed@example.com', await replaceCode())).status).toBe(201);
  });

  it('a wrong code says nothing about the email', async () => {
    await replaceCode();
    const res = await register(TEST_USER.email, generateRegistrationCode());

    expect(res.status).toBe(400);
    expect((res.body as { error: { code: string } }).error.code).toBe('INVALID_REGISTRATION_CODE');
  });

  it('an existing email gets 409 and is not counted as a use', async () => {
    const code = await replaceCode();

    expect((await register(TEST_USER.email.toUpperCase(), code)).status).toBe(409);
    const status = (await asAdmin('get', '/registration-code')).body as RegistrationCodeDto;
    expect(status.usedCount).toBe(0);
  });

  it('requires a password of at least 10 characters', async () => {
    expect((await register('short@example.com', await replaceCode(), 'short')).status).toBe(400);
  });
});

describe('managing users', () => {
  it('lists users with the end of the code they registered with', async () => {
    const code = await replaceCode();
    await register('neighbour@example.com', code);

    const list = ((await asAdmin('get', '/users')).body as { data: AdminUserDto[] }).data;
    expect(list.find((user) => user.email === 'neighbour@example.com')).toMatchObject({
      isActive: true,
      isAdmin: false,
      registeredWithCode: normalizeRegistrationCode(code).slice(-4),
      aiRecommendationsToday: 0,
    });
    expect(list.find((user) => user.email === TEST_USER.email)?.registeredWithCode).toBeNull();
  });

  it('blocks a user at once and can let them back in', async () => {
    const created = await register('blocked@example.com', await replaceCode());
    const cookie = cookieFrom(created);
    const id = await userIdOf('blocked@example.com');
    const me = () => request(testApp.app).get('/api/v1/users/me').set('cookie', cookie);

    await request(testApp.app)
      .patch(`/api/v1/users/${id}`)
      .set('cookie', adminCookie)
      .send({ isActive: false });
    expect((await me()).status).toBe(401);

    await request(testApp.app)
      .patch(`/api/v1/users/${id}`)
      .set('cookie', adminCookie)
      .send({ isActive: true });
    expect((await me()).status).toBe(200);
  });

  it('an administrator cannot block themselves', async () => {
    const res = await request(testApp.app)
      .patch(`/api/v1/users/${await userIdOf(ADMIN.email)}`)
      .set('cookie', adminCookie)
      .send({ isActive: false });
    expect(res.status).toBe(400);
  });
});

describe('RegistrationCodeVault', () => {
  it('decrypts its own payloads and refuses ones made with another secret', () => {
    const vault = new RegistrationCodeVault('a-secret-that-is-at-least-32-characters!!');
    const payload = vault.encrypt('ABCD-EFGH-JKMN');
    const other = new RegistrationCodeVault('another-secret-of-at-least-32-characters');

    expect(vault.decrypt(payload)).toBe('ABCD-EFGH-JKMN');
    expect(other.decrypt(payload)).toBeNull();
  });
});

describe('registration rate limit', () => {
  it('allows only a few attempts per IP and hour – wrong codes count too', async () => {
    const limited = await createTestApp({ options: { registrationsPerHour: 2 } });
    try {
      const attempt = () => {
        return request(limited.app).post('/api/v1/users').send({
          email: 'x@example.com',
          password: 'a-good-password-1',
          registrationCode: 'WRON-GCOD-E123',
        });
      };
      expect((await attempt()).status).toBe(400);
      expect((await attempt()).status).toBe(400);
      expect((await attempt()).status).toBe(429);
    } finally {
      await limited.close();
    }
  }, 60_000);
});

describe('GET /api/v1/logs – the log screen for administrators', () => {
  async function seedLogs() {
    const now = Date.now();
    const row = (minutesAgo: number, fields: object) => {
      return {
        createdAt: new Date(now - minutesAgo * 60_000),
        level: 'info',
        category: 'request' as const,
        message: 'request completed',
        requestId: null,
        userId: null,
        method: 'GET',
        path: '/api/v1/cities',
        status: 200,
        durationMs: 5,
        details: null,
        ...fields,
      };
    };
    await new AppLogRepository(testApp.handle.db).insert([
      row(300, { message: 'old one' }),
      row(5, { category: 'ai', message: 'LLM call', details: { provider: 'gemini' } }),
      row(4, { level: 'warn', category: 'ai', message: 'LLM call failed' }),
      row(3, { level: 'error', category: 'system', message: 'Unhandled error' }),
      row(2, { path: '/api/v1/market-assessments?cityId=9' }),
    ]);
  }

  it('is for administrators only', async () => {
    expect((await request(testApp.app).get('/api/v1/logs')).status).toBe(401);
    expect((await request(testApp.app).get('/api/v1/logs').set('cookie', userCookie)).status).toBe(
      403,
    );
  });

  it('filters by level, category, text and time, newest first, with paging', async () => {
    await seedLogs();
    const page = async (query: string) => {
      return (await asAdmin('get', `/logs?${query}`)).body as LogPageDto;
    };

    expect((await page('level=error')).data.map((e) => e.message)).toEqual(['Unhandled error']);
    expect((await page('level=warn')).data.map((e) => e.message)).toEqual([
      'Unhandled error',
      'LLM call failed',
    ]);
    expect((await page('category=ai')).data.map((e) => e.message)).toEqual([
      'LLM call failed',
      'LLM call',
    ]);
    expect((await page('q=gemini')).data.map((e) => e.message)).toEqual(['LLM call']);
    expect((await page('q=cityId%3D9')).data).toHaveLength(1);
    expect((await page('hours=1&category=request')).data.some((e) => e.message === 'old one')).toBe(
      false,
    );

    const first = await page('pageSize=2');
    expect(first.data).toHaveLength(2);
    expect(first.nextBefore).toBe(first.data[1]?.id);
    const second = await page(`pageSize=2&before=${first.nextBefore ?? 0}`);
    expect(second.data[0]?.id).toBeLessThan(first.data[1]?.id ?? 0);
  });

  it('rejects unknown filters', async () => {
    expect((await asAdmin('get', '/logs?category=nope')).status).toBe(400);
  });
});
