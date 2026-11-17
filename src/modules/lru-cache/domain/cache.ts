import { Clock } from '../../../common/utils/clock';
import { EvictionPolicy } from './eviction-policy.interface';

interface Entry<V> {
  value: V;
  expiresAt: number | null;
}

export interface CacheStats {
  size: number;
  capacity: number;
  hits: number;
  misses: number;
  evictions: number;
  expirations: number;
  hitRate: number;
}

export interface CacheOptions {
  capacity: number;
  defaultTtlMs?: number;
  onEvict?: (key: unknown, value: unknown) => void;
}

/**
 * Plain TypeScript, no Nest. get/put/delete are O(1).
 * Expired entries are removed lazily, when someone touches them.
 */
export class Cache<K, V> {
  private readonly entries = new Map<K, Entry<V>>();
  private hits = 0;
  private misses = 0;
  private evictions = 0;
  private expirations = 0;

  constructor(
    private readonly options: CacheOptions,
    private readonly policy: EvictionPolicy<K>,
    private readonly clock: Clock,
  ) {
    if (!Number.isInteger(options.capacity) || options.capacity < 1) {
      throw new Error('capacity must be a positive integer');
    }
  }

  get capacity(): number {
    return this.options.capacity;
  }

  get size(): number {
    return this.entries.size;
  }

  get(key: K): V | undefined {
    const entry = this.liveEntry(key);
    if (!entry) {
      this.misses++;
      return undefined;
    }
    this.hits++;
    this.policy.onAccess(key);
    return entry.value;
  }

  has(key: K): boolean {
    return this.liveEntry(key) !== undefined;
  }

  /** Returns the key evicted to make room, if any. */
  put(key: K, value: V, ttlMs?: number): { evictedKey?: K } {
    const ttl = ttlMs ?? this.options.defaultTtlMs;
    const entry: Entry<V> = { value, expiresAt: ttl ? this.clock.now() + ttl : null };

    if (this.liveEntry(key)) {
      this.entries.set(key, entry);
      this.policy.onAccess(key);
      return {};
    }

    let evictedKey: K | undefined;
    if (this.entries.size >= this.options.capacity) {
      evictedKey = this.policy.evict();
      if (evictedKey !== undefined) {
        const evicted = this.entries.get(evictedKey);
        this.entries.delete(evictedKey);
        this.evictions++;
        this.options.onEvict?.(evictedKey, evicted?.value);
      }
    }

    this.entries.set(key, entry);
    this.policy.onInsert(key);
    return evictedKey === undefined ? {} : { evictedKey };
  }

  delete(key: K): boolean {
    if (!this.entries.has(key)) return false;
    this.entries.delete(key);
    this.policy.onRemove(key);
    return true;
  }

  /** Live keys, most recently used first. */
  keys(): K[] {
    this.purgeExpired();
    return this.policy.keys();
  }

  entriesInOrder(): Array<{ key: K; value: V; expiresAt: number | null }> {
    return this.keys().map((key) => ({ key, ...this.entries.get(key)! }));
  }

  clear(): void {
    this.entries.clear();
    this.policy.clear();
  }

  stats(): CacheStats {
    this.purgeExpired();
    const lookups = this.hits + this.misses;
    return {
      size: this.entries.size,
      capacity: this.options.capacity,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      expirations: this.expirations,
      hitRate: lookups === 0 ? 0 : Number((this.hits / lookups).toFixed(4)),
    };
  }

  /** The entry if present and not expired; removes it if expired. Does not touch recency. */
  private liveEntry(key: K): Entry<V> | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt !== null && entry.expiresAt <= this.clock.now()) {
      this.entries.delete(key);
      this.policy.onRemove(key);
      this.expirations++;
      return undefined;
    }
    return entry;
  }

  private purgeExpired(): void {
    for (const key of [...this.entries.keys()]) this.liveEntry(key);
  }
}
