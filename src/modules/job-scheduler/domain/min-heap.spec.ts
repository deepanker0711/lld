import { MinHeap } from './min-heap';

function drain<T>(heap: MinHeap<T>): T[] {
  const out: T[] = [];
  while (!heap.isEmpty()) out.push(heap.pop()!);
  return out;
}

describe('MinHeap', () => {
  it('returns undefined from peek/pop when empty', () => {
    const heap = new MinHeap<number>((a, b) => a - b);
    expect(heap.peek()).toBeUndefined();
    expect(heap.pop()).toBeUndefined();
    expect(heap.size).toBe(0);
  });

  it('peek shows the smallest without removing it', () => {
    const heap = new MinHeap<number>((a, b) => a - b);
    [5, 3, 8].forEach((n) => heap.push(n));
    expect(heap.peek()).toBe(3);
    expect(heap.size).toBe(3);
  });

  it('pops in ascending order', () => {
    const heap = new MinHeap<number>((a, b) => a - b);
    [5, 3, 8, 1, 9, 2, 7].forEach((n) => heap.push(n));
    expect(drain(heap)).toEqual([1, 2, 3, 5, 7, 8, 9]);
  });

  it('acts as a max-heap with a reversed comparator', () => {
    const heap = new MinHeap<number>((a, b) => b - a);
    [5, 3, 8, 1].forEach((n) => heap.push(n));
    expect(drain(heap)).toEqual([8, 5, 3, 1]);
  });

  it('handles duplicates and interleaved push/pop', () => {
    const heap = new MinHeap<number>((a, b) => a - b);
    heap.push(4);
    heap.push(4);
    heap.push(1);
    expect(heap.pop()).toBe(1);
    heap.push(2);
    expect(drain(heap)).toEqual([2, 4, 4]);
  });

  it('matches Array.sort on random input', () => {
    const values = Array.from({ length: 500 }, () =>
      Math.floor(Math.random() * 100),
    );
    const heap = new MinHeap<number>((a, b) => a - b);
    values.forEach((v) => heap.push(v));
    expect(drain(heap)).toEqual([...values].sort((a, b) => a - b));
  });

  describe('job ordering: (runAt asc, priority desc, seq asc)', () => {
    type Entry = { id: string; runAt: number; priority: number; seq: number };
    let seq = 0;
    const entry = (id: string, runAt: number, priority = 0): Entry => ({
      id,
      runAt,
      priority,
      seq: seq++,
    });
    const byJobOrder = (a: Entry, b: Entry) =>
      a.runAt - b.runAt || b.priority - a.priority || a.seq - b.seq;

    it('earlier runAt wins, then higher priority, then FIFO', () => {
      const heap = new MinHeap<Entry>(byJobOrder);
      heap.push(entry('late', 200));
      heap.push(entry('low-1', 100, 1));
      heap.push(entry('high', 100, 5));
      heap.push(entry('low-2', 100, 1));
      heap.push(entry('early', 50, 0));
      expect(drain(heap).map((e) => e.id)).toEqual([
        'early',
        'high',
        'low-1',
        'low-2',
        'late',
      ]);
    });

    it('keeps FIFO for many exact ties thanks to the seq tie-breaker', () => {
      const heap = new MinHeap<Entry>(byJobOrder);
      const ids = Array.from({ length: 20 }, (_, i) => `j${i}`);
      ids.forEach((id) => heap.push(entry(id, 100, 1)));
      expect(drain(heap).map((e) => e.id)).toEqual(ids);
    });
  });
});
