import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, loginCookie, type TestApp } from './testApp.js';

let testApp: TestApp;

beforeAll(async () => {
  testApp = await createTestApp();
}, 60_000);

afterAll(async () => {
  await testApp.close();
});

describe('GET /api/v1/health', () => {
  it('is public and returns ok with a request id header', async () => {
    const res = await request(testApp.app).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  it('echoes a client-provided request id', async () => {
    const res = await request(testApp.app).get('/api/v1/health').set('x-request-id', 'abc-123');

    expect(res.headers['x-request-id']).toBe('abc-123');
  });
});

describe('unknown API route', () => {
  it('returns 401 before revealing anything to an anonymous caller', async () => {
    const res = await request(testApp.app).get('/api/v1/does-not-exist');

    expect(res.status).toBe(401);
  });

  it('returns 404 with a Hebrew message and a stable code to a logged-in user', async () => {
    const cookie = await loginCookie(testApp.app);

    const res = await request(testApp.app).get('/api/v1/does-not-exist').set('cookie', cookie);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.error.message).toBe('הנתיב המבוקש לא קיים');
  });
});
