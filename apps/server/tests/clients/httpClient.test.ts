import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { HttpClient, HttpError, type FetchFn } from '../../src/clients/httpClient.js';
import { logger } from '../../src/lib/logger.js';

const schema = z.object({ value: z.number() });
const noSleep = (): Promise<void> => {
  return Promise.resolve();
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('HttpClient.getJson', () => {
  it('returns the validated body', async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue(jsonResponse({ value: 7 }));
    const client = new HttpClient(logger, fetchFn, noSleep);

    await expect(client.getJson('https://api.test/x', { schema })).resolves.toEqual({ value: 7 });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('retries on 5xx and succeeds', async () => {
    const fetchFn = vi
      .fn<FetchFn>()
      .mockResolvedValueOnce(jsonResponse({}, 503))
      .mockResolvedValueOnce(jsonResponse({ value: 1 }));
    const client = new HttpClient(logger, fetchFn, noSleep);

    await expect(client.getJson('https://api.test/x', { schema })).resolves.toEqual({ value: 1 });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('retries on network errors and timeouts, then gives up', async () => {
    const timeout = new DOMException('timed out', 'TimeoutError');
    const fetchFn = vi
      .fn<FetchFn>()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockRejectedValueOnce(timeout)
      .mockRejectedValueOnce(timeout);
    const client = new HttpClient(logger, fetchFn, noSleep);

    await expect(client.getJson('https://api.test/x', { schema, retries: 2 })).rejects.toThrow(
      /Timeout/,
    );
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it('does not retry a 4xx', async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue(jsonResponse({}, 404));
    const client = new HttpClient(logger, fetchFn, noSleep);

    const error = await client
      .getJson('https://api.test/x', { schema })
      .catch((err: unknown) => err);

    expect(error).toBeInstanceOf(HttpError);
    expect((error as HttpError).status).toBe(404);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('rejects a response with an unexpected shape without retrying', async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue(jsonResponse({ value: 'seven' }));
    const client = new HttpClient(logger, fetchFn, noSleep);

    await expect(client.getJson('https://api.test/x', { schema })).rejects.toThrow(
      /Unexpected response shape/,
    );
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
