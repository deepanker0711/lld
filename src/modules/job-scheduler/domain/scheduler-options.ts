export interface SchedulerOptions {
  /** How often the loop checks the heap for due jobs. */
  tickMs: number;
  /** Max handlers running at the same time (worker pool size). */
  poolSize: number;
  /** On shutdown, wait this long for running handlers before giving up. */
  shutdownTimeoutMs: number;
  /** First retry waits this long; each further retry doubles it. */
  baseBackoffMs: number;
  /** Upper bound for a single backoff wait. */
  maxBackoffMs: number;
}

export const DEFAULT_SCHEDULER_OPTIONS: SchedulerOptions = {
  tickMs: 100,
  poolSize: 2,
  shutdownTimeoutMs: 5000,
  baseBackoffMs: 1000,
  maxBackoffMs: 60_000,
};

/** DI token: SchedulerOptions is an interface, so it needs a runtime key. */
export const SCHEDULER_OPTIONS = Symbol('SCHEDULER_OPTIONS');
