import { TokenBucket } from './token-bucket';

describe('TokenBucket (5 per 10s → 1 token every 2s)', () => {
  const make = () => new TokenBucket({ limit: 5, windowMs: 10_000 });

  it('allows a burst up to the limit, then blocks', () => {
    const tb = make();
    for (let i = 0; i < 5; i++) expect(tb.tryConsume('a', 0).allowed).toBe(true);
    const blocked = tb.tryConsume('a', 0);
    expect(blocked).toMatchObject({ allowed: false, remaining: 0, retryAfterMs: 2_000 });
  });

  it('refills one token per 2s based on elapsed time', () => {
    const tb = make();
    for (let i = 0; i < 5; i++) tb.tryConsume('a', 0);
    expect(tb.tryConsume('a', 1_999).allowed).toBe(false);
    expect(tb.tryConsume('a', 2_000).allowed).toBe(true);
    expect(tb.tryConsume('a', 2_000).allowed).toBe(false);
  });

  it('never refills above the limit', () => {
    const tb = make();
    tb.tryConsume('a', 0);
    expect(tb.peek('a', 1_000_000).remaining).toBe(5);
  });

  it('keeps clients independent', () => {
    const tb = make();
    for (let i = 0; i < 5; i++) tb.tryConsume('a', 0);
    expect(tb.tryConsume('b', 0).allowed).toBe(true);
  });

  it('peek does not consume', () => {
    const tb = make();
    tb.peek('a', 0);
    tb.peek('a', 0);
    expect(tb.peek('a', 0).remaining).toBe(5);
  });

  it('prune drops clients whose bucket is full again', () => {
    const tb = make();
    tb.tryConsume('a', 0);
    tb.tryConsume('b', 0);
    for (let i = 0; i < 4; i++) tb.tryConsume('b', 1_000);
    expect(tb.prune(2_000)).toBe(1); // a refilled, b still owes tokens
    expect(tb.trackedClients()).toBe(1);
  });
});
