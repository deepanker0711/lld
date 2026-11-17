import { Injectable } from '@nestjs/common';

/**
 * Inject Clock instead of calling Date.now() directly in anything with
 * time logic (TTL, expiry, fees by duration, scheduling, rate limits).
 * Tests then swap in FakeClock and move time forward without sleeping.
 */
@Injectable()
export class Clock {
  now(): number {
    return Date.now();
  }

  date(): Date {
    return new Date(this.now());
  }
}

export class FakeClock extends Clock {
  constructor(private current = 0) {
    super();
  }

  override now(): number {
    return this.current;
  }

  advance(ms: number): void {
    this.current += ms;
  }

  set(ms: number): void {
    this.current = ms;
  }
}
