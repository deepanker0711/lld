export interface AuthOptions {
  /** HMAC secret for access tokens. From AUTH_JWT_SECRET in production; never commit one. */
  jwtSecret: string;
  issuer: string;
  accessTokenTtlMs: number;
  /** Absolute lifetime of a session; refreshing doesn't extend it past this. */
  sessionTtlMs: number;
  /** Failed logins in a row before the account is locked. */
  maxFailedAttempts: number;
  lockoutMs: number;
  /** scrypt cost (N). 16384 in production; tests use a small value to stay fast. */
  scryptCost: number;
  /** Registering with one of these emails grants ADMIN (demo stand-in for an admin console). */
  adminEmails: string[];
}

const MINUTE = 60_000;

export const DEFAULT_AUTH_OPTIONS: AuthOptions = {
  jwtSecret: 'dev-only-secret-change-me',
  issuer: 'lld-practice',
  accessTokenTtlMs: 15 * MINUTE,
  sessionTtlMs: 7 * 24 * 60 * MINUTE,
  maxFailedAttempts: 5,
  lockoutMs: 15 * MINUTE,
  scryptCost: 16384,
  adminEmails: ['admin@example.com'],
};

export function authOptionsFromEnv(env: NodeJS.ProcessEnv = process.env): AuthOptions {
  return {
    ...DEFAULT_AUTH_OPTIONS,
    jwtSecret: env.AUTH_JWT_SECRET ?? DEFAULT_AUTH_OPTIONS.jwtSecret,
  };
}

export const AUTH_OPTIONS = Symbol('AUTH_OPTIONS');
