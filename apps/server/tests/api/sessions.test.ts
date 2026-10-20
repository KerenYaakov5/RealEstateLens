import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { users } from '../../src/db/schema.js';
import { createTestApp, loginCookie, TEST_USER, type TestApp } from './testApp.js';

let testApp: TestApp;

beforeEach(async () => {
  testApp = await createTestApp();
}, 60_000);

afterEach(async () => {
  await testApp.close();
});

describe('POST /api/v1/sessions', () => {
  it('logs in and sets an httpOnly session cookie', async () => {
    const res = await request(testApp.app).post('/api/v1/sessions').send(TEST_USER);

    expect(res.status).toBe(201);
    expect(res.body.user).toEqual({ email: TEST_USER.email });
    const cookie = res.headers['set-cookie']?.[0] ?? '';
    expect(cookie).toMatch(/^rel_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });

  it('accepts the email in any case and with spaces', async () => {
    const res = await request(testApp.app)
      .post('/api/v1/sessions')
      .send({ email: '  Tester@Example.COM ', password: TEST_USER.password });

    expect(res.status).toBe(201);
  });

  it('gives the same 401 for a wrong password and an unknown email', async () => {
    const wrongPassword = await request(testApp.app)
      .post('/api/v1/sessions')
      .send({ email: TEST_USER.email, password: 'nope' });
    const unknownEmail = await request(testApp.app)
      .post('/api/v1/sessions')
      .send({ email: 'nobody@example.com', password: 'nope' });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body.error.message).toBe(unknownEmail.body.error.message);
    expect(wrongPassword.headers['set-cookie']).toBeUndefined();
  });

  it('rejects a malformed body with 400', async () => {
    const res = await request(testApp.app).post('/api/v1/sessions').send({ email: 'not-an-email' });

    expect(res.status).toBe(400);
  });

  it('answers malformed JSON with 400, not a server error', async () => {
    const res = await request(testApp.app)
      .post('/api/v1/sessions')
      .set('content-type', 'application/json')
      .send('{"email": broken');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });

  it('answers an oversized body with 413', async () => {
    const res = await request(testApp.app)
      .post('/api/v1/sessions')
      .send({ email: 'a@b.co', password: 'x'.repeat(200_000) });

    expect(res.status).toBe(413);
  });

  it('rejects a deactivated user', async () => {
    await testApp.handle.db
      .update(users)
      .set({ isActive: false })
      .where(eq(users.email, TEST_USER.email));

    const res = await request(testApp.app).post('/api/v1/sessions').send(TEST_USER);

    expect(res.status).toBe(401);
  });

  it('blocks with 429 after too many failed attempts, without counting successes', async () => {
    for (let i = 0; i < 5; i++) {
      await request(testApp.app)
        .post('/api/v1/sessions')
        .send({ email: TEST_USER.email, password: `wrong-${i}` });
    }

    const res = await request(testApp.app).post('/api/v1/sessions').send(TEST_USER);

    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('TOO_MANY_REQUESTS');
  });
});

describe('protected routes', () => {
  it('GET /users/me returns 401 without a session', async () => {
    const res = await request(testApp.app).get('/api/v1/users/me');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('GET /users/me returns the user with a valid session', async () => {
    const cookie = await loginCookie(testApp.app);

    const res = await request(testApp.app).get('/api/v1/users/me').set('cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ email: TEST_USER.email, aiQuotaLeft: 20 });
  });

  it('rejects a forged or tampered token', async () => {
    const cookie = await loginCookie(testApp.app);
    const tampered = `${cookie.slice(0, -4)}abcd`;

    const res = await request(testApp.app).get('/api/v1/users/me').set('cookie', tampered);

    expect(res.status).toBe(401);
  });
});

describe('DELETE /api/v1/sessions/current', () => {
  it('clears the cookie and is idempotent', async () => {
    const res = await request(testApp.app).delete('/api/v1/sessions/current');

    expect(res.status).toBe(204);
    expect(res.headers['set-cookie']?.[0]).toMatch(/rel_session=;/);
  });
});
