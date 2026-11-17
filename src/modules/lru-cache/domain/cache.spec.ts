import { FakeClock } from '../../../common/utils/clock';
import { Cache } from './cache';
import { LruEvictionPolicy } from './lru-eviction.policy';

function makeCache(capacity: number, clock = new FakeClock(), defaultTtlMs?: number) {
  return new Cache<string, number>({ capacity, defaultTtlMs }, new LruEvictionPolicy<string>(), clock);
}

describe('Cache with LRU policy', () => {
  it('evicts the least recently used key when full', () => {
    const cache = makeCache(2);
    cache.put('a', 1);
    cache.put('b', 2);
    expect(cache.put('c', 3)).toEqual({ evictedKey: 'a' });
    expect(cache.get('a')).toBeUndefined();
    expect(cache.keys()).toEqual(['c', 'b']);
  });

  it('get() promotes a key so it survives the next eviction', () => {
    const cache = makeCache(2);
    cache.put('a', 1);
    cache.put('b', 2);
    cache.get('a');
    expect(cache.put('c', 3).evictedKey).toBe('b');
    expect(cache.keys()).toEqual(['c', 'a']);
  });

  it('overwriting a key updates value and recency without evicting', () => {
    const cache = makeCache(2);
    cache.put('a', 1);
    cache.put('b', 2);
    expect(cache.put('a', 10)).toEqual({});
    expect(cache.get('a')).toBe(10);
    expect(cache.put('c', 3).evictedKey).toBe('b');
  });

  it('works with capacity 1', () => {
    const cache = makeCache(1);
    cache.put('a', 1);
    expect(cache.put('b', 2).evictedKey).toBe('a');
    expect(cache.keys()).toEqual(['b']);
  });

  it('delete removes the key from value store and policy', () => {
    const cache = makeCache(2);
    cache.put('a', 1);
    cache.put('b', 2);
    expect(cache.delete('a')).toBe(true);
    expect(cache.delete('a')).toBe(false);
    cache.put('c', 3);
    expect(cache.keys()).toEqual(['c', 'b']);
    expect(cache.stats().evictions).toBe(0);
  });

  it('expires keys after their TTL (lazy expiry)', () => {
    const clock = new FakeClock(1_000);
    const cache = makeCache(3, clock, 500);
    cache.put('a', 1);
    cache.put('b', 2, 2_000);
    clock.advance(499);
    expect(cache.get('a')).toBe(1);
    clock.advance(1);
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe(2);
    expect(cache.stats()).toMatchObject({ size: 1, expirations: 1 });
  });

  it('an expired key frees its slot instead of forcing an eviction', () => {
    const clock = new FakeClock();
    const cache = makeCache(2, clock);
    cache.put('a', 1, 100);
    cache.put('b', 2);
    clock.advance(100);
    expect(cache.keys()).toEqual(['b']);
    expect(cache.put('c', 3)).toEqual({});
  });

  it('tracks hits, misses and hit rate', () => {
    const cache = makeCache(2);
    cache.put('a', 1);
    cache.get('a');
    cache.get('a');
    cache.get('x');
    expect(cache.stats()).toMatchObject({ hits: 2, misses: 1, hitRate: 0.6667 });
  });

  it('rejects invalid capacity', () => {
    expect(() => makeCache(0)).toThrow();
  });
});
