import { KeyedMutex } from './keyed-mutex';

const tick = () => new Promise((r) => setTimeout(r, 5));

describe('KeyedMutex', () => {
  it('runs calls with the same key one at a time', async () => {
    const mutex = new KeyedMutex();
    let free = 1;
    const winners: string[] = [];
    const book = (who: string) =>
      mutex.runExclusive('slot-1', async () => {
        const available = free > 0;
        await tick(); // without the lock both callers would see available=true
        if (available) {
          free--;
          winners.push(who);
        }
      });

    await Promise.all([book('A'), book('B'), book('C')]);
    expect(winners).toEqual(['A']);
    expect(free).toBe(0);
  });

  it('releases the lock when the function throws', async () => {
    const mutex = new KeyedMutex();
    await expect(mutex.runExclusive('k', () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    await expect(mutex.runExclusive('k', () => 42)).resolves.toBe(42);
  });
});
