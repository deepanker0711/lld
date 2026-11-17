export class ListNode<T> {
  prev: ListNode<T> | null = null;
  next: ListNode<T> | null = null;
  constructor(public value: T) {}
}

/**
 * Doubly linked list with sentinel head/tail nodes, so there are no null
 * checks for "first" or "last" element. Every operation is O(1) given a node.
 *
 *   head <-> [most recent] <-> ... <-> [least recent] <-> tail
 */
export class DoublyLinkedList<T> {
  private readonly head: ListNode<T>;
  private readonly tail: ListNode<T>;
  private _size = 0;

  constructor() {
    this.head = new ListNode<T>(null as T);
    this.tail = new ListNode<T>(null as T);
    this.head.next = this.tail;
    this.tail.prev = this.head;
  }

  get size(): number {
    return this._size;
  }

  addToHead(node: ListNode<T>): ListNode<T> {
    node.prev = this.head;
    node.next = this.head.next;
    this.head.next!.prev = node;
    this.head.next = node;
    this._size++;
    return node;
  }

  remove(node: ListNode<T>): void {
    node.prev!.next = node.next;
    node.next!.prev = node.prev;
    node.prev = node.next = null;
    this._size--;
  }

  moveToHead(node: ListNode<T>): void {
    this.remove(node);
    this.addToHead(node);
  }

  /** Removes and returns the last real node (least recently used), or null if empty. */
  removeTail(): ListNode<T> | null {
    if (this._size === 0) return null;
    const node = this.tail.prev!;
    this.remove(node);
    return node;
  }

  /** Values from head (most recent) to tail (least recent). */
  *values(): IterableIterator<T> {
    for (let n = this.head.next; n && n !== this.tail; n = n.next) yield n.value;
  }
}
