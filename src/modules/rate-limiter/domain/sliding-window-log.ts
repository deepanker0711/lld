import { RateLimitAlgorithm, RateLimitAlgorithmType, RateLimitConfig, RateLimitDecision } from './rate-limit-algorithm';

/**
 * Keeps the timestamp of every allowed request in the last windowMs.
 * Allowed if fewer than `limit` timestamps are in the window.
 * Exact (no burst at window edges, unlike fixed window) but O(limit) memory per client.
 *
 * Timestamps are sorted because time only moves forward, so expired ones are at the
 * front. Array.shift() is O(n); fine for small limits, a ring buffer/deque in production.
 */
export class SlidingWindowLog implements RateLimitAlgorithm {
  readonly type = RateLimitAlgorithmType.SLIDING_WINDOW_LOG;
  private readonly logs = new Map<string, number[]>();

  constructor(private readonly config: RateLimitConfig) {}

  tryConsume(clientId: string, now: number): RateLimitDecision {
    const log = this.evictOld(clientId, now);
    if (log.length < this.config.limit) {
      log.push(now);
      this.logs.set(clientId, log);
      return this.decision(true, log, now);
    }
    return this.decision(false, log, now);
  }

  peek(clientId: string, now: number): RateLimitDecision {
    const log = this.evictOld(clientId, now);
    return this.decision(log.length < this.config.limit, log, now);
  }

  prune(now: number): number {
    let removed = 0;
    for (const clientId of [...this.logs.keys()]) {
      if (this.evictOld(clientId, now).length === 0) {
        this.logs.delete(clientId);
        removed++;
      }
    }
    return removed;
  }

  trackedClients(): number {
    return this.logs.size;
  }

  /** Drops timestamps that fell out of the window: those at or before now - windowMs. */
  private evictOld(clientId: string, now: number): number[] {
    const log = this.logs.get(clientId) ?? [];
    const windowStart = now - this.config.windowMs;
    while (log.length > 0 && log[0] <= windowStart) log.shift();
    return log;
  }

  private decision(allowed: boolean, log: number[], now: number): RateLimitDecision {
    const { limit, windowMs } = this.config;
    const remaining = Math.max(0, limit - log.length);
    const oldest = log[0];
    return {
      allowed,
      limit,
      remaining,
      // Full: wait until the oldest request leaves the window.
      retryAfterMs: remaining > 0 ? 0 : oldest + windowMs - now,
      // Every logged request has left the window.
      resetAfterMs: log.length === 0 ? 0 : log[log.length - 1] + windowMs - now,
    };
  }
}
