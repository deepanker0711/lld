import { backoffDelay, nextRecurrence } from './schedule-math';

describe('backoffDelay', () => {
  it('doubles per attempt and caps at max', () => {
    expect(
      [1, 2, 3, 4, 5, 6, 7].map((a) => backoffDelay(a, 1000, 30_000)),
    ).toEqual([1000, 2000, 4000, 8000, 16_000, 30_000, 30_000]);
  });
});

describe('nextRecurrence', () => {
  it('anchors to the scheduled time, not the finish time', () => {
    expect(nextRecurrence(0, 5000, 1200)).toBe(5000);
  });

  it('skips missed slots instead of bursting', () => {
    expect(nextRecurrence(0, 5000, 12_000)).toBe(15_000);
  });

  it('a run finishing exactly on the next slot moves to the one after', () => {
    expect(nextRecurrence(0, 5000, 5000)).toBe(10_000);
  });
});
