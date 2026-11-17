import { Injectable, Logger } from '@nestjs/common';
import { ConflictError, NotFoundError } from '../../common/errors/domain.errors';
import { Clock } from '../../common/utils/clock';
import { Cache } from './domain/cache';
import { createEvictionPolicy } from './domain/eviction-policy.factory';
import { EvictionPolicyType } from './domain/eviction-policy.interface';
import { CreateCacheDto } from './dto/create-cache.dto';

interface CacheMeta {
  name: string;
  policy: string;
  defaultTtlMs: number | null;
  createdAt: string;
}

/**
 * Owns many named caches. All HTTP-free logic lives here and in domain/,
 * so the controller is a thin mapping layer.
 */
@Injectable()
export class CacheManagerService {
  private readonly logger = new Logger(CacheManagerService.name);
  private readonly caches = new Map<string, { cache: Cache<string, unknown>; meta: CacheMeta }>();

  constructor(private readonly clock: Clock) {}

  create(dto: CreateCacheDto) {
    if (this.caches.has(dto.name)) throw new ConflictError(`Cache '${dto.name}' already exists`);

    const cache = new Cache<string, unknown>(
      {
        capacity: dto.capacity,
        defaultTtlMs: dto.defaultTtlMs,
        onEvict: (key) => this.logger.log(`[${dto.name}] evicted '${String(key)}'`),
      },
      createEvictionPolicy<string>(dto.policy ?? EvictionPolicyType.LRU),
      this.clock,
    );
    const meta: CacheMeta = {
      name: dto.name,
      policy: dto.policy ?? EvictionPolicyType.LRU,
      defaultTtlMs: dto.defaultTtlMs ?? null,
      createdAt: this.clock.date().toISOString(),
    };
    this.caches.set(dto.name, { cache, meta });
    return this.describe(dto.name);
  }

  list() {
    return [...this.caches.keys()].map((name) => this.describe(name));
  }

  describe(name: string) {
    const { cache, meta } = this.getOrThrow(name);
    return { ...meta, capacity: cache.capacity, size: cache.size };
  }

  remove(name: string) {
    this.getOrThrow(name);
    this.caches.delete(name);
    return { deleted: name };
  }

  put(name: string, key: string, value: unknown, ttlMs?: number) {
    const { evictedKey } = this.getOrThrow(name).cache.put(key, value, ttlMs);
    return { key, value, evictedKey: evictedKey ?? null };
  }

  get(name: string, key: string) {
    const value = this.getOrThrow(name).cache.get(key);
    if (value === undefined) throw new NotFoundError(`Key '${key}' in cache '${name}'`);
    return { key, value };
  }

  deleteKey(name: string, key: string) {
    if (!this.getOrThrow(name).cache.delete(key)) throw new NotFoundError(`Key '${key}' in cache '${name}'`);
    return { deleted: key };
  }

  entries(name: string) {
    return this.getOrThrow(name)
      .cache.entriesInOrder()
      .map(({ key, value, expiresAt }) => ({
        key,
        value,
        expiresAt: expiresAt === null ? null : new Date(expiresAt).toISOString(),
      }));
  }

  stats(name: string) {
    return this.getOrThrow(name).cache.stats();
  }

  private getOrThrow(name: string) {
    const found = this.caches.get(name);
    if (!found) throw new NotFoundError('Cache', name);
    return found;
  }
}
