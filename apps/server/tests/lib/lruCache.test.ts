import { describe, expect, it } from 'vitest';
import { LruCache } from '../../src/lib/lruCache.js';

describe('LruCache', () => {
  it('evicts the least recently used entry when full', () => {
    const cache = new LruCache<number>(2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.get('a');
    cache.set('c', 3);

    expect(cache.get('a')).toBe(1);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('c')).toBe(3);
    expect(cache.size).toBe(2);
  });

  it('overwrites an existing key without growing', () => {
    const cache = new LruCache<number>(2);
    cache.set('a', 1);
    cache.set('a', 2);

    expect(cache.get('a')).toBe(2);
    expect(cache.size).toBe(1);
  });
});
