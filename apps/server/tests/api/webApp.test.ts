import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './testApp.js';

let testApp: TestApp;

beforeAll(async () => {
  const dist = await mkdtemp(path.join(tmpdir(), 'rel-web-'));
  await mkdir(path.join(dist, 'assets'));
  await writeFile(path.join(dist, 'index.html'), '<!doctype html><title>RealEstateLens</title>');
  await writeFile(path.join(dist, 'assets', 'index-abc123.js'), 'console.log(1);');
  testApp = await createTestApp({ options: { webDistPath: dist } });
}, 60_000);

afterAll(async () => {
  await testApp.close();
});

describe('serving the web client', () => {
  it('serves index.html at the root, never cached', async () => {
    const res = await request(testApp.app).get('/');

    expect(res.status).toBe(200);
    expect(res.text).toContain('RealEstateLens');
    expect(res.headers['cache-control']).toBe('no-cache');
  });

  it('returns index.html for client-side routes', async () => {
    const res = await request(testApp.app).get('/some/screen');

    expect(res.status).toBe(200);
    expect(res.text).toContain('RealEstateLens');
  });

  it('caches hashed assets for a year', async () => {
    const res = await request(testApp.app).get('/assets/index-abc123.js');

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toContain('immutable');
    expect(res.headers['cache-control']).toContain('max-age=31536000');
  });

  it('returns 404 for a missing asset instead of index.html', async () => {
    expect((await request(testApp.app).get('/assets/missing.js')).status).toBe(404);
  });

  it('never answers API paths with the web app', async () => {
    const res = await request(testApp.app).get('/api/v1/unknown');

    expect(res.status).toBe(401);
    expect(res.headers['content-type']).toContain('application/json');
  });

  it('sends security headers with a strict content policy', async () => {
    const res = await request(testApp.app).get('/');
    const policy = String(res.headers['content-security-policy']);

    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain('https://fonts.gstatic.com');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});
