import { RateLimitAlgorithm, RateLimitAlgorithmType, RateLimitConfig, RateLimitDecision } from './rate-limit-algorithm';

interface Bucket {
  tokens: number;
  lastRefillAt: number;
}

/**
 * Each client has a bucket of `limit` tokens that refills continuously at
 * limit / windowMs tokens per ms. A request takes one token.
 * Allows bursts up to `limit`, then a steady rate. O(1) time and memory per client.
 *
 * Refill is computed from elapsed time on each call (no timers), so idle clients cost nothing.
 */
export class TokenBucket implements RateLimitAlgorithm {
  readonly type = RateLimitAlgorithmType.TOKEN_BUCKET;
  private readonly buckets = new Map<string, Bucket>();

  constructor(private readonly config: RateLimitConfig) {}

  tryConsume(clientId: string, now: number): RateLimitDecision {
    const bucket = this.refill(clientId, now);
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return this.decision(true, bucket);
    }
    return this.decision(false, bucket);
  }

  peek(clientId: string, now: number): RateLimitDecision {
    const bucket = this.refill(clientId, now);
    return this.decision(bucket.tokens >= 1, bucket);
  }

  prune(now: number): number {
    let removed = 0;
    for (const clientId of [...this.buckets.keys()]) {
      if (this.refill(clientId, now).tokens >= this.config.limit) {
        this.buckets.delete(clientId);
        removed++;
      }
    }
    return removed;
  }

  trackedClients(): number {
    return this.buckets.size;
  }

  private refill(clientId: string, now: number): Bucket {
    const { limit, windowMs } = this.config;
    let bucket = this.buckets.get(clientId);
    if (!bucket) {
      bucket = { tokens: limit, lastRefillAt: now };
      this.buckets.set(clientId, bucket);
      return bucket;
    }
    const elapsed = Math.max(0, now - bucket.lastRefillAt);
    // (elapsed * limit) / windowMs rather than elapsed * (limit / windowMs): fewer float errors.
    bucket.tokens = Math.min(limit, bucket.tokens + (elapsed * limit) / windowMs);
    bucket.lastRefillAt = now;
    return bucket;
  }

  private decision(allowed: boolean, bucket: Bucket): RateLimitDecision {
    const { limit, windowMs } = this.config;
    const msPerToken = windowMs / limit;
    return {
      allowed,
      limit,
      remaining: Math.floor(bucket.tokens),
      retryAfterMs: bucket.tokens >= 1 ? 0 : Math.ceil((1 - bucket.tokens) * msPerToken),
      resetAfterMs: Math.ceil((limit - bucket.tokens) * msPerToken),
    };
  }
}
