import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Mapped Diagnostic Context: values that ride along with a request through every await,
 * so a log line deep in a service still carries requestId without passing it around.
 */
export class LogContext {
  private static readonly storage = new AsyncLocalStorage<Record<string, unknown>>();

  static run<T>(values: Record<string, unknown>, fn: () => T): T {
    return this.storage.run({ ...this.current(), ...values }, fn);
  }

  static current(): Readonly<Record<string, unknown>> {
    return this.storage.getStore() ?? {};
  }

  /** Add to the current request's context (e.g. userId once auth has run). */
  static set(key: string, value: unknown): void {
    const store = this.storage.getStore();
    if (store) store[key] = value;
  }
}
