import { SlidingWindowLog } from './sliding-window-log';

describe('SlidingWindowLog (3 per 10s)', () => {
  const make = () => new SlidingWindowLog({ limit: 3, windowMs: 10_000 });

  it('allows `limit` requests in the window and reports when the next is allowed', () => {
    const sw = make();
    expect(sw.tryConsume('a', 0).allowed).toBe(true);
    expect(sw.tryConsume('a', 4_000).allowed).toBe(true);
    expect(sw.tryConsume('a', 6_000).allowed).toBe(true);
    expect(sw.tryConsume('a', 7_000)).toMatchObject({ allowed: false, retryAfterMs: 3_000 });
  });

  it('frees a slot exactly when the oldest request leaves the window', () => {
    const sw = make();
    [0, 4_000, 6_000].forEach((t) => sw.tryConsume('a', t));
    expect(sw.tryConsume('a', 9_999).allowed).toBe(false);
    expect(sw.tryConsume('a', 10_000).allowed).toBe(true); // request at 0 is out
    expect(sw.tryConsume('a', 10_000).allowed).toBe(false);
  });

  it('has no boundary burst (a fixed window would allow 6 here)', () => {
    const sw = make();
    [9_000, 9_500, 9_900].forEach((t) => expect(sw.tryConsume('a', t).allowed).toBe(true));
    expect(sw.tryConsume('a', 10_100).allowed).toBe(false);
  });

  it('blocked requests are not logged', () => {
    const sw = make();
    [0, 1, 2].forEach((t) => sw.tryConsume('a', t));
    for (let i = 0; i < 10; i++) sw.tryConsume('a', 5_000);
    expect(sw.tryConsume('a', 10_000).allowed).toBe(true);
  });

  it('prune drops clients with an empty window', () => {
    const sw = make();
    sw.tryConsume('a', 0);
    sw.tryConsume('b', 5_000);
    expect(sw.prune(10_000)).toBe(1);
    expect(sw.trackedClients()).toBe(1);
  });
});
