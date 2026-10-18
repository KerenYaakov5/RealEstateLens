import { describe, expect, it, vi } from 'vitest';
import { MemoryCache } from '../../src/lib/memoryCache.js';

function clock(start = 0): { now: () => number; advance: (ms: number) => void } {
  let current = start;
  return {
    now: () => current,
    advance: (ms) => {
      current += ms;
    },
  };
}

describe('MemoryCache', () => {
  it('loads once and serves from memory within the TTL', async () => {
    const loader = vi.fn(async () => 'data');
    const time = clock();
    const cache = new MemoryCache(loader, 1000, time.now);

    await cache.get();
    time.advance(999);
    await expect(cache.get()).resolves.toBe('data');

    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('reloads after the TTL expires', async () => {
    const loader = vi.fn(async () => 'data');
    const time = clock();
    const cache = new MemoryCache(loader, 1000, time.now);

    await cache.get();
    time.advance(1000);
    await cache.get();

    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('shares a single in-flight load between concurrent callers', async () => {
    const loader = vi.fn(async () => 'data');
    const cache = new MemoryCache(loader, 1000);

    await Promise.all([cache.get(), cache.get(), cache.get()]);

    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('does not cache a failed first load', async () => {
    const loader = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValueOnce('data');
    const cache = new MemoryCache(loader, 1000);

    await expect(cache.get()).rejects.toThrow('db down');
    await expect(cache.get()).resolves.toBe('data');
  });

  it('keeps serving the previous value when a refresh fails', async () => {
    const loader = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce('old')
      .mockRejectedValueOnce(new Error('db down'));
    const onRefreshError = vi.fn();
    const time = clock();
    const cache = new MemoryCache(loader, 1000, time.now, onRefreshError);

    await cache.get();
    time.advance(2000);

    await expect(cache.get()).resolves.toBe('old');
    expect(onRefreshError).toHaveBeenCalledOnce();
  });

  it('reloads after invalidate', async () => {
    const loader = vi.fn(async () => 'data');
    const cache = new MemoryCache(loader, 60_000);

    await cache.get();
    cache.invalidate();
    await cache.get();

    expect(loader).toHaveBeenCalledTimes(2);
  });
});
