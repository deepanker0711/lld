import { Injectable } from '@nestjs/common';

/**
 * Per-key async lock. Node runs one thing at a time, but an async service
 * method can be interleaved with another at every `await`:
 *
 *   const slot = findFree();   // request A and B both see slot S1 free
 *   await chargePayment();     // <- A yields here, B runs
 *   occupy(slot);              // both occupy S1
 *
 * Wrap the critical section so calls with the same key run one after another:
 *
 *   return this.mutex.runExclusive(`lot:${lotId}`, async () => { ... });
 *
 * Different keys still run concurrently. In a multi-instance deployment this
 * would be a Redis lock or a DB row lock / optimistic version check.
 */
@Injectable()
export class KeyedMutex {
  private readonly tails = new Map<string, Promise<void>>();

  async runExclusive<T>(key: string, fn: () => Promise<T> | T): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => (release = resolve));
    const tail = previous.then(() => current);
    this.tails.set(key, tail);

    await previous;
    try {
      return await fn();
    } finally {
      release();
      // Drop the entry if no one queued behind us, so the map doesn't grow forever.
      if (this.tails.get(key) === tail) this.tails.delete(key);
    }
  }
}
