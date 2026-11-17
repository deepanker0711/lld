# 03 · Rate Limiter

> **Implemented (reference).** Read `src/modules/rate-limiter/`, run `requests/rate-limiter.http`. Handbook chapter has the walkthrough and senior follow-ups.

## Requirements
- Limit requests per client (header `x-client-id`, fall back to IP) per route group.
- Algorithms: **token bucket** (default) and **sliding window log**, configurable per rule.
- Blocked requests get **429** + headers `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `Retry-After`.
- Admin APIs to create/update rules and check a client's current usage.

## Entities
- `RateLimitRule` (`key` e.g. "default" / "search", `algorithm`, `limit`, `windowMs` / `refillPerSec`)
- Per-client state lives inside the algorithm class (a `Map<clientId, bucket>`), not in a repository.

## API
| Method | Path | Body | Success | Errors |
|---|---|---|---|---|
| POST | `/rate-limits/rules` | `{ key, algorithm, limit, windowMs }` | 201 | 400, 409 |
| PATCH | `/rate-limits/rules/:key` | partial | 200 | 404 |
| GET | `/rate-limits/rules` | – | 200 | – |
| GET | `/rate-limits/usage/:clientId?rule=` | – | 200 `{ remaining, resetAt }` | 404 |
| GET | `/limited/ping` | – | 200 `pong` (protected with `@RateLimit('default')`) | 429 |
| GET | `/limited/search` | – | 200 (protected with `@RateLimit('search')`) | 429 |

## Patterns
- **Strategy** `RateLimitAlgorithm { tryConsume(clientId, now): { allowed, remaining, retryAfterMs } }` → `TokenBucket`, `SlidingWindowLog`. Follow-up: `FixedWindow`, `SlidingWindowCounter`.
- **Factory** builds the algorithm from the rule.
- **Decorator + Guard** (Nest): `@RateLimit('search')` sets metadata; `RateLimitGuard` reads it with `Reflector`.

## Edge cases
- Exactly at the limit → allowed; limit + 1 → 429.
- Token bucket refill must use elapsed time (`Clock`), not `setInterval`.
- Updating a rule resets that rule's buckets (state why).
- Missing `x-client-id` → fall back to `req.ip`.

## Tickets
- **T1** Algorithm interface + `TokenBucket` with `FakeClock` unit tests (burst, refill, cap at capacity).
- **T2** `SlidingWindowLog` + tests (old timestamps drop out of the window).
- **T3** Rules CRUD + factory + a `RateLimiterService.check(ruleKey, clientId)`.
- **T4** `@RateLimit()` decorator (`SetMetadata`) + guard that throws `TooManyRequestsError` and sets headers.
- **T5** Demo routes + usage endpoint + `.http` (a loop: `for i in {1..12}; do curl -s -o /dev/null -w "%{http_code} " ...; done`).

## Hints
- Token bucket state: `{ tokens, lastRefillAt }`. On each call: `tokens = min(cap, tokens + elapsedSec * rate)`, then consume 1 if `tokens >= 1`.
- Sliding window log: store timestamps in an array (or deque), drop those `<= now - windowMs`, allow if `length < limit`. Memory is O(limit) per client. That's the trade-off vs. the counter version.
- Headers from a guard: `context.switchToHttp().getResponse().setHeader(...)`.
- Multi-instance answer: Redis + Lua script (atomic read-modify-write), or `INCR` + `EXPIRE` for fixed window.

## Acceptance
```
POST /rate-limits/rules {"key":"default","algorithm":"TOKEN_BUCKET","limit":5,"windowMs":10000}
GET /limited/ping ×5 (x-client-id: a)   → 200 ×5
GET /limited/ping (x-client-id: a)      → 429, Retry-After set
GET /limited/ping (x-client-id: b)      → 200   (separate bucket)
```
