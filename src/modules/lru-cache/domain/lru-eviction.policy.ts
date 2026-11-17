import { DoublyLinkedList, ListNode } from './doubly-linked-list';
import { EvictionPolicy } from './eviction-policy.interface';

/**
 * LRU = Map<key, node> for O(1) lookup + DoublyLinkedList for O(1) reordering.
 * Most recently used is at the head; evict from the tail.
 */
export class LruEvictionPolicy<K> implements EvictionPolicy<K> {
  private readonly nodes = new Map<K, ListNode<K>>();
  private readonly list = new DoublyLinkedList<K>();

  onInsert(key: K): void {
    if (this.nodes.has(key)) return this.onAccess(key);
    this.nodes.set(key, this.list.addToHead(new ListNode(key)));
  }

  onAccess(key: K): void {
    const node = this.nodes.get(key);
    if (node) this.list.moveToHead(node);
  }

  onRemove(key: K): void {
    const node = this.nodes.get(key);
    if (!node) return;
    this.list.remove(node);
    this.nodes.delete(key);
  }

  evict(): K | undefined {
    const node = this.list.removeTail();
    if (!node) return undefined;
    this.nodes.delete(node.value);
    return node.value;
  }

  keys(): K[] {
    return [...this.list.values()];
  }

  clear(): void {
    for (const node of [...this.nodes.values()]) this.list.remove(node);
    this.nodes.clear();
  }
}
