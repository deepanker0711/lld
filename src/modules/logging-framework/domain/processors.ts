import { LogRecord } from './log-record';

/**
 * Chain of responsibility: each processor may change a record or drop it (return null)
 * before any appender sees it.
 */
export type RecordProcessor = (record: LogRecord) => LogRecord | null;

const REDACTED = '[REDACTED]';

/** Masks sensitive keys at any depth in fields and context. Case-insensitive. */
export function redactKeys(keys: string[]): RecordProcessor {
  const secret = new Set(keys.map((k) => k.toLowerCase()));
  const scrub = (value: unknown, depth = 0): unknown => {
    if (depth > 5 || value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1));
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, secret.has(k.toLowerCase()) ? REDACTED : scrub(v, depth + 1)]),
    );
  };
  return (r) => ({
    ...r,
    fields: scrub(r.fields) as Record<string, unknown>,
    context: scrub(r.context) as Record<string, unknown>,
  });
}

/** Drops records whose message matches, e.g. noisy health-check lines. */
export function dropWhen(predicate: (r: LogRecord) => boolean): RecordProcessor {
  return (r) => (predicate(r) ? null : r);
}
