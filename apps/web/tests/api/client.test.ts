import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, getJson } from '../../src/api/client';

function mockFetch(response: Response | Error): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(() => {
    return response instanceof Error ? Promise.reject(response) : Promise.resolve(response);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getJson', () => {
  it('calls the versioned API on the same origin and returns the body', async () => {
    const fetchMock = mockFetch(new Response(JSON.stringify({ data: [1] }), { status: 200 }));

    await expect(getJson('/cities')).resolves.toEqual({ data: [1] });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/cities',
      expect.objectContaining({ credentials: 'same-origin' }),
    );
  });

  it('returns null for 204 No Content', async () => {
    mockFetch(new Response(null, { status: 204 }));

    await expect(getJson('/cities?search=xyz')).resolves.toBeNull();
  });

  it('surfaces the Hebrew message and code written by the server', async () => {
    mockFetch(
      new Response(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'העיר לא נמצאה' } }), {
        status: 404,
      }),
    );

    const error = await getJson('/cities/9/neighborhoods').catch((err: unknown) => err);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 404, code: 'NOT_FOUND', message: 'העיר לא נמצאה' });
  });

  it('turns a network failure into a friendly Hebrew error', async () => {
    mockFetch(new TypeError('Failed to fetch'));

    await expect(getJson('/cities')).rejects.toMatchObject({ status: 0, code: 'NETWORK' });
  });
});
