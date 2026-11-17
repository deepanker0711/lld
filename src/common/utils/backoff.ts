/**
 * Exponential backoff: base, 2×base, 4×base, ... capped at max.
 * attempt is the attempt that just failed (1-based): attempt 1 failed → wait base.
 *
 *   base=1000:  attempt 1 → 1s, 2 → 2s, 3 → 4s, 4 → 8s, ... → max
 *
 * Shared by the job scheduler and the notification dispatcher.
 */
export function backoffDelay(
  attempt: number,
  baseMs: number,
  maxMs: number,
): number {
  return Math.min(baseMs * 2 ** (attempt - 1), maxMs);
}
