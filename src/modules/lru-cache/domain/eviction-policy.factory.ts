import { EvictionPolicy, EvictionPolicyType } from './eviction-policy.interface';
import { LruEvictionPolicy } from './lru-eviction.policy';

/** Factory pattern: callers ask for a type, not a concrete class. */
export function createEvictionPolicy<K>(type: EvictionPolicyType): EvictionPolicy<K> {
  switch (type) {
    case EvictionPolicyType.LRU:
      return new LruEvictionPolicy<K>();
  }
}
