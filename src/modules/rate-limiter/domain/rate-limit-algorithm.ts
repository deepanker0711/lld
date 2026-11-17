export enum RateLimitAlgorithmType {
  TOKEN_BUCKET = 'TOKEN_BUCKET',
  SLIDING_WINDOW_LOG = 'SLIDING_WINDOW_LOG',
}

export interface RateLimitConfig {
  /** Max requests per window (also the bucket size for token bucket). */
  limit: number;
  windowMs: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** 0 when allowed; otherwise how long until one more request would pass. */
  retryAfterMs: number;
  /** How long until the client is back to a full allowance. */
  resetAfterMs: number;
}

/**
 * Strategy: one instance per rule, holding the state of every client for that rule.
 * Everything is synchronous, so a check-and-consume can't be interleaved with another
 * request in Node. Across servers this state moves to Redis with a Lua script.
 */
export interface RateLimitAlgorithm {
  readonly type: RateLimitAlgorithmType;
  /** Check and, if allowed, record the request. */
  tryConsume(clientId: string, now: number): RateLimitDecision;
  /** Current allowance without consuming. */
  peek(clientId: string, now: number): RateLimitDecision;
  /** Drop state for clients that are back to a full allowance. Returns how many were dropped. */
  prune(now: number): number;
  trackedClients(): number;
}
