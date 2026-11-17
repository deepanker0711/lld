// Moved to common so the notification dispatcher can reuse it; re-exported to keep imports stable.
export { backoffDelay } from '../../../common/utils/backoff';

/**
 * A recurring job's slots form a fixed grid: anchor, anchor + interval, anchor + 2×interval, ...
 * Returns the first slot strictly after `now`.
 *
 * Anchoring to the grid (not to when the run finished) means the job never drifts later,
 * however long runs take or however many retries happen. If slots were missed (a slow
 * run, the server was down), they are skipped instead of fired back-to-back.
 *
 *   anchor=0, interval=5000, now=1200   → 5000
 *   anchor=0, interval=5000, now=12000  → 15000   (5000 and 10000 were missed: skipped)
 */
export function nextRecurrence(
  anchorMs: number,
  intervalMs: number,
  now: number,
): number {
  const slotsPassed = Math.floor((now - anchorMs) / intervalMs);
  return anchorMs + (slotsPassed + 1) * intervalMs;
}
