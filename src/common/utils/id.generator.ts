import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

/** generateId('tkt') -> 'tkt_3f2a9c1e-...'. Prefixes make ids readable in demos. */
export function generateId(prefix?: string): string {
  const id = randomUUID();
  return prefix ? `${prefix}_${id}` : id;
}

const BASE62 = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function toBase62(n: number): string {
  if (!Number.isSafeInteger(n) || n < 0) throw new Error('toBase62 expects a non-negative safe integer');
  if (n === 0) return '0';
  let out = '';
  while (n > 0) {
    out = BASE62[n % 62] + out;
    n = Math.floor(n / 62);
  }
  return out;
}

/**
 * Named monotonic counters: next('ticket') -> 1, 2, 3...
 * Useful for human-friendly numbers (ticket #42) and base62 short codes.
 */
@Injectable()
export class SequenceGenerator {
  private readonly counters = new Map<string, number>();

  next(name = 'default', start = 1): number {
    const value = (this.counters.get(name) ?? start - 1) + 1;
    this.counters.set(name, value);
    return value;
  }
}
