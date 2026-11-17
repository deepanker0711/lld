export interface NotificationOptions {
  /** Total tries per delivery, including the first. */
  maxAttempts: number;
  /** First retry waits this long; each further retry doubles it. */
  baseBackoffMs: number;
  maxBackoffMs: number;
  /** On shutdown, wait this long for in-flight sends. */
  shutdownTimeoutMs: number;
  /** Fake providers: chance (0..1) that any send fails at random. */
  fakeFailRate: number;
  /** Fake providers: simulated network time per send. */
  fakeLatencyMs: number;
}

export const DEFAULT_NOTIFICATION_OPTIONS: NotificationOptions = {
  maxAttempts: 3,
  baseBackoffMs: 1000,
  maxBackoffMs: 30_000,
  shutdownTimeoutMs: 5000,
  fakeFailRate: 0,
  fakeLatencyMs: 50,
};

/** NOTIFY_FAIL_RATE=0.3 npm run start:dev → 30% of sends fail, to demo retries. */
export function notificationOptionsFromEnv(
  env: Record<string, string | undefined> = process.env,
): NotificationOptions {
  const rate = Number(env.NOTIFY_FAIL_RATE ?? 0);
  return {
    ...DEFAULT_NOTIFICATION_OPTIONS,
    fakeFailRate: Number.isFinite(rate) ? Math.min(Math.max(rate, 0), 1) : 0,
  };
}

export const NOTIFICATION_OPTIONS = Symbol('NOTIFICATION_OPTIONS');
