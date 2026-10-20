import type { AdminUserDto, CreatedInviteCodeDto, InviteCodeDto } from '@rel/shared';
import { eq, sql } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inviteCodes } from '../../src/db/schema.js';
import { hashPassword } from '../../src/services/auth.service.js';
import { createTestApp, loginCookie, TEST_USER, type TestApp } from './testApp.js';

const ADMIN = { email: 'admin@example.com', password: 'admin-password-123' };

let testApp: TestApp;
let adminCookie: string;
let userCookie: string;

async function cookieOf(credentials: { email: string; password: string }): Promise<string> {
  const res = await request(testApp.app).post('/api/v1/sessions').send(credentials);
  return (res.headers['set-cookie']?.[0] ?? '').split(';')[0] ?? '';
}

async function createCode(body: object = { label: 'דנה', maxUses: 1 }) {
  const res = await request(testApp.app)
    .post('/api/v1/invite-codes')
    .set('cookie', adminCookie)
    .send(body);
  return res.body as CreatedInviteCodeDto;
}

function register(email: string, inviteCode: string, password = 'a-good-password-1') {
  return request(testApp.app).post('/api/v1/users').send({ email, password, inviteCode });
}

beforeAll(async () => {
  testApp = await createTestApp({ adminEmails: [ADMIN.email] });
  await testApp.users.create(ADMIN.email, await hashPassword(ADMIN.password));
  adminCookie = await cookieOf(ADMIN);
  userCookie = await loginCookie(testApp.app);
}, 120_000);

afterAll(async () => {
  await testApp.close();
});

describe('invite codes (administrators only)', () => {
  it('are hidden from guests (401) and regular users (403)', async () => {
    expect((await request(testApp.app).get('/api/v1/invite-codes')).status).toBe(401);
    const asUser = await request(testApp.app).get('/api/v1/invite-codes').set('cookie', userCookie);
    expect(asUser.status).toBe(403);
    const users = await request(testApp.app).get('/api/v1/users').set('cookie', userCookie);
    expect(users.status).toBe(403);
  });

  it('marks the administrator in /users/me', async () => {
    const me = await request(testApp.app).get('/api/v1/users/me').set('cookie', adminCookie);
    expect(me.body).toMatchObject({ email: ADMIN.email, isAdmin: true });
  });

  it('shows the full code once, then only a hint', async () => {
    const created = await createCode({ label: 'משפחה', maxUses: 3, expiresInDays: 7 });

    expect(created.code).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
    expect(created).toMatchObject({ label: 'משפחה', maxUses: 3, usedCount: 0, status: 'active' });
    const list = await request(testApp.app).get('/api/v1/invite-codes').set('cookie', adminCookie);
    const listed = (list.body as { data: InviteCodeDto[] }).data.find((c) => c.id === created.id);
    expect(listed?.hint).toBe(created.code.replace('-', '').slice(-4));
    expect(JSON.stringify(list.body)).not.toContain(created.code);
  });

  it('validates the new code', async () => {
    const res = await request(testApp.app)
      .post('/api/v1/invite-codes')
      .set('cookie', adminCookie)
      .send({ label: '', maxUses: 0 });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/v1/users – registration with an invite code', () => {
  it('registers, logs the new user in, and uses up a single-use code', async () => {
    const { code, id } = await createCode();

    const res = await register('new.user@example.com', code);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ user: { email: 'new.user@example.com', isAdmin: false } });
    const cookie = (res.headers['set-cookie']?.[0] ?? '').split(';')[0] ?? '';
    const me = await request(testApp.app).get('/api/v1/users/me').set('cookie', cookie);
    expect(me.status).toBe(200);

    const again = await register('another@example.com', code);
    expect(again.status).toBe(400);
    expect((again.body as { error: { code: string } }).error.code).toBe('INVALID_INVITE_CODE');
    const list = await request(testApp.app).get('/api/v1/invite-codes').set('cookie', adminCookie);
    expect((list.body as { data: InviteCodeDto[] }).data.find((c) => c.id === id)?.status).toBe(
      'used-up',
    );
  });

  it('accepts the code typed in lower case and without the dash', async () => {
    const { code } = await createCode();
    const typed = code.replace('-', '').toLowerCase();

    expect((await register('typed@example.com', ` ${typed} `)).status).toBe(201);
  });

  it('rejects an unknown code without revealing anything about the email', async () => {
    const res = await register(TEST_USER.email, 'AAAAA-BBBBB');
    expect(res.status).toBe(400);
    expect((res.body as { error: { code: string } }).error.code).toBe('INVALID_INVITE_CODE');
  });

  it('an existing email gets 409 and the code keeps its use', async () => {
    const { code, id } = await createCode();

    const res = await register(TEST_USER.email.toUpperCase(), code);
    expect(res.status).toBe(409);
    const [row] = await testApp.handle.db
      .select({ usedCount: inviteCodes.usedCount })
      .from(inviteCodes)
      .where(eq(inviteCodes.id, id));
    expect(row?.usedCount).toBe(0);
  });

  it('refuses disabled and expired codes; a re-enabled code works again', async () => {
    const disabled = await createCode();
    await request(testApp.app)
      .patch(`/api/v1/invite-codes/${disabled.id}`)
      .set('cookie', adminCookie)
      .send({ disabled: true });
    expect((await register('d1@example.com', disabled.code)).status).toBe(400);
    await request(testApp.app)
      .patch(`/api/v1/invite-codes/${disabled.id}`)
      .set('cookie', adminCookie)
      .send({ disabled: false });
    expect((await register('d1@example.com', disabled.code)).status).toBe(201);

    const expired = await createCode({ label: 'פג', maxUses: 5, expiresInDays: 1 });
    await testApp.handle.db
      .update(inviteCodes)
      .set({ expiresAt: sql`now() - interval '1 minute'` })
      .where(eq(inviteCodes.id, expired.id));
    expect((await register('e1@example.com', expired.code)).status).toBe(400);
  });

  it('requires a password of at least 10 characters', async () => {
    const { code } = await createCode();
    expect((await register('short@example.com', code, 'short')).status).toBe(400);
  });
});

describe('managing users', () => {
  it('lists users with the code they came with and their AI use today', async () => {
    const { code } = await createCode({ label: 'שכנים', maxUses: 1 });
    await register('neighbour@example.com', code);

    const res = await request(testApp.app).get('/api/v1/users').set('cookie', adminCookie);
    const list = (res.body as { data: AdminUserDto[] }).data;
    expect(list.find((user) => user.email === 'neighbour@example.com')).toMatchObject({
      isActive: true,
      isAdmin: false,
      invitedWith: 'שכנים',
      aiRecommendationsToday: 0,
    });
    expect(list.find((user) => user.email === ADMIN.email)?.isAdmin).toBe(true);
  });

  it('blocks a user at once and can let them back in', async () => {
    const { code } = await createCode();
    const created = await register('blocked@example.com', code);
    const cookie = (created.headers['set-cookie']?.[0] ?? '').split(';')[0] ?? '';
    const list = (await request(testApp.app).get('/api/v1/users').set('cookie', adminCookie))
      .body as { data: AdminUserDto[] };
    const id = list.data.find((user) => user.email === 'blocked@example.com')?.id ?? 0;

    await request(testApp.app)
      .patch(`/api/v1/users/${id}`)
      .set('cookie', adminCookie)
      .send({ isActive: false });
    expect((await request(testApp.app).get('/api/v1/users/me').set('cookie', cookie)).status).toBe(
      401,
    );

    await request(testApp.app)
      .patch(`/api/v1/users/${id}`)
      .set('cookie', adminCookie)
      .send({ isActive: true });
    expect((await request(testApp.app).get('/api/v1/users/me').set('cookie', cookie)).status).toBe(
      200,
    );
  });

  it('an administrator cannot block themselves', async () => {
    const list = (await request(testApp.app).get('/api/v1/users').set('cookie', adminCookie))
      .body as { data: AdminUserDto[] };
    const self = list.data.find((user) => user.email === ADMIN.email)?.id ?? 0;

    const res = await request(testApp.app)
      .patch(`/api/v1/users/${self}`)
      .set('cookie', adminCookie)
      .send({ isActive: false });
    expect(res.status).toBe(400);
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
          inviteCode: 'WRONG-CODE1',
        });
      };
      expect((await attempt()).status).toBe(400);
      expect((await attempt()).status).toBe(400);
      expect((await attempt()).status).toBe(429);
    } finally {
      await limited.close();
    }
  });
});
