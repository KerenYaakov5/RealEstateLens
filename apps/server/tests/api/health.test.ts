import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';

describe('GET /api/v1/health', () => {
  it('returns ok with a request id header', async () => {
    const res = await request(createApp()).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  it('echoes a client-provided request id', async () => {
    const res = await request(createApp()).get('/api/v1/health').set('x-request-id', 'abc-123');

    expect(res.headers['x-request-id']).toBe('abc-123');
  });
});

describe('unknown API route', () => {
  it('returns 404 with a Hebrew message and a stable code', async () => {
    const res = await request(createApp()).get('/api/v1/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.error.message).toBe('הנתיב המבוקש לא קיים');
  });
});
