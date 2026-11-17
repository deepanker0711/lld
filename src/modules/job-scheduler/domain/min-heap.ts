/**
 * Returns < 0 if `a` should come out first, > 0 if `b` should, 0 if they tie.
 * Same contract as Array.prototype.sort, so `(a, b) => a - b` gives a min-heap of numbers.
 */
export type Comparator<T> = (a: T, b: T) => number;

/**
 * Binary min-heap stored in a flat array. The "smallest" item per the comparator is
 * always at index 0.
 *
 *   index:      0   1   2   3   4   5   6
 *   tree:            [0]
 *                  /     \
 *               [1]       [2]
 *              /   \     /   \
 *            [3]   [4] [5]   [6]
 *
 *   parent(i) = (i - 1) >> 1      left(i) = 2i + 1      right(i) = 2i + 2
 *
 * Invariant: every parent <= its children. Siblings have no order between them.
 *
 *   push  O(log n)  append at the end, sift up
 *   pop   O(log n)  move last item to the root, sift down
 *   peek  O(1)
 *
 * Not stable: two items that compare equal can come out in any order. If FIFO matters
 * for ties (it does for jobs), add a sequence number as the final tie-breaker in the
 * comparator.
 */
export class MinHeap<T> {
  private readonly items: T[] = [];

  constructor(private readonly compare: Comparator<T>) {}

  get size(): number {
    return this.items.length;
  }

  isEmpty(): boolean {
    return this.items.length === 0;
  }

  peek(): T | undefined {
    return this.items[0];
  }

  push(item: T): void {
    this.items.push(item);
    this.siftUp(this.items.length - 1);
  }

  pop(): T | undefined {
    if (this.items.length === 0) return undefined;
    const top = this.items[0];
    const last = this.items.pop()!;
    // If the heap had one item, `last` was the top and we're done.
    if (this.items.length > 0) {
      this.items[0] = last;
      this.siftDown(0);
    }
    return top;
  }

  /** Copy in heap (array) order, not sorted order. For debugging/inspection only. */
  toArray(): T[] {
    return [...this.items];
  }

  /** New item at the bottom climbs while it is smaller than its parent. */
  private siftUp(index: number): void {
    let i = index;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.compare(this.items[i], this.items[parent]) >= 0) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  /** Item at the root sinks, swapping with its smaller child, until both children are >= it. */
  private siftDown(index: number): void {
    const n = this.items.length;
    let i = index;
    while (true) {
      const left = 2 * i + 1;
      const right = left + 1;
      let smallest = i;
      if (left < n && this.compare(this.items[left], this.items[smallest]) < 0)
        smallest = left;
      if (
        right < n &&
        this.compare(this.items[right], this.items[smallest]) < 0
      )
        smallest = right;
      if (smallest === i) break;
      this.swap(i, smallest);
      i = smallest;
    }
  }

  private swap(i: number, j: number): void {
    [this.items[i], this.items[j]] = [this.items[j], this.items[i]];
  }
}
