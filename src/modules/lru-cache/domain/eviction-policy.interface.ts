/**
 * Strategy pattern: the cache tracks values, the policy decides who to evict.
 * The cache tells the policy about every access; the policy only stores keys.
 * Add LFU/FIFO by writing another class that implements this interface.
 */
export interface EvictionPolicy<K> {
  /** A new key was inserted. */
  onInsert(key: K): void;
  /** An existing key was read or overwritten. */
  onAccess(key: K): void;
  /** A key was deleted or expired (not evicted by the policy). */
  onRemove(key: K): void;
  /** Pick a key to evict and stop tracking it. */
  evict(): K | undefined;
  /** Keys in the order this policy would keep them (first = safest). */
  keys(): K[];
  clear(): void;
}

export enum EvictionPolicyType {
  LRU = 'LRU',
}
