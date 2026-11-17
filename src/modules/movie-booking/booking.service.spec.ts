import { BookingStatus } from './domain/booking-status';
import { createBookingKit, MINUTE } from './testing/booking-test-kit';

async function errorOf(fn: () => unknown) {
  try {
    await fn();
  } catch (e) {
    return e as { httpStatus: number; message: string; details?: unknown };
  }
  throw new Error('expected an error');
}

describe('Movie booking', () => {
  let kit: ReturnType<typeof createBookingKit>;
  let showId: string;

  beforeEach(() => {
    kit = createBookingKit();
    showId = kit.seed().show.id;
  });

  it('seat map: every seat available, priced by type', () => {
    const map = kit.service.seatMap(showId);
    expect(map.counts).toEqual({ AVAILABLE: 6, HELD: 0, BOOKED: 0 });
    expect(map.rows.map((r) => [r.row, r.seats.map((s) => s.code)])).toEqual([
      ['A', ['A1', 'A2', 'A3', 'A4']],
      ['B', ['B1', 'B2']],
    ]);
    expect(map.rows[1].seats[0].pricePaise).toBe(500_00);
  });

  it('weekend shows cost 10% more (Friday in IST, even when it is Thursday in UTC)', () => {
    const { show: fri } = kit.seed('2026-11-12T19:00:00.000Z'); // Fri 00:30 IST, Thu 19:00 UTC
    const booking = kit.service.hold(fri.id, { userId: 'u1', seats: ['A1'] });
    expect(booking.quote).toMatchObject({ ticketsPaise: 220_00, convenienceFeePaise: 30_00, totalPaise: 250_00 });
  });

  it('hold is all-or-nothing: one taken seat rejects the whole request', async () => {
    kit.service.hold(showId, { userId: 'u1', seats: ['A1', 'A2'] });
    const err = await errorOf(() => kit.service.hold(showId, { userId: 'u2', seats: ['A2', 'A3'] }));
    expect(err).toMatchObject({ httpStatus: 409, details: { taken: ['A2'] } });
    expect(kit.service.seatMap(showId).counts).toEqual({ AVAILABLE: 4, HELD: 2, BOOKED: 0 });
  });

  it('400 for unknown or duplicate seats', async () => {
    expect(await errorOf(() => kit.service.hold(showId, { userId: 'u1', seats: ['Z9'] }))).toMatchObject({ httpStatus: 400 });
    expect(await errorOf(() => kit.service.hold(showId, { userId: 'u1', seats: ['A1', 'A1'] }))).toMatchObject({ httpStatus: 400 });
  });

  it('a hold lapses after 5 minutes: the seats free up lazily and confirming is 410', async () => {
    const b = kit.service.hold(showId, { userId: 'u1', seats: ['A1'] });
    kit.clock.advance(5 * MINUTE);
    expect(kit.service.seatMap(showId).counts.AVAILABLE).toBe(6);
    expect(await errorOf(() => kit.service.confirm(b.id, 'u1', 'tok_ok'))).toMatchObject({ httpStatus: 410 });
    expect(kit.service.hold(showId, { userId: 'u2', seats: ['A1'] }).status).toBe(BookingStatus.HELD);
  });

  it('confirm charges once; a second confirm is 409; others get 403', async () => {
    const b = kit.service.hold(showId, { userId: 'u1', seats: ['B1', 'B2'] });
    expect(await errorOf(() => kit.service.confirm(b.id, 'u2', 'tok_ok'))).toMatchObject({ httpStatus: 403 });
    const confirmed = await kit.service.confirm(b.id, 'u1', 'tok_ok');
    expect(confirmed).toMatchObject({ status: BookingStatus.CONFIRMED, paymentId: 'pay_1' });
    expect(kit.payments.charges).toEqual([1_060_00]); // 2 × 500 + 2 × 30 fee
    expect(await errorOf(() => kit.service.confirm(b.id, 'u1', 'tok_ok'))).toMatchObject({ httpStatus: 409 });
    expect(kit.service.seatMap(showId).counts.BOOKED).toBe(2);
  });

  it('a slow payment can’t lose the seats: the hold does not expire while CONFIRMING', async () => {
    const b = kit.service.hold(showId, { userId: 'u1', seats: ['A1'] });
    kit.payments.hold = true;
    const pending = kit.service.confirm(b.id, 'u1', 'tok_ok');
    await new Promise((r) => setImmediate(r));

    kit.clock.advance(10 * MINUTE); // way past the hold
    expect(await errorOf(() => kit.service.hold(showId, { userId: 'u2', seats: ['A1'] }))).toMatchObject({ httpStatus: 409 });

    kit.payments.release();
    expect((await pending).status).toBe(BookingStatus.CONFIRMED);
  });

  it('a declined card goes back to HELD so the user can retry before the hold ends', async () => {
    const b = kit.service.hold(showId, { userId: 'u1', seats: ['A1'] });
    expect(await errorOf(() => kit.service.confirm(b.id, 'u1', 'tok_decline'))).toMatchObject({ httpStatus: 422 });
    expect(kit.service.get(b.id).status).toBe(BookingStatus.HELD);
    expect((await kit.service.confirm(b.id, 'u1', 'tok_ok')).status).toBe(BookingStatus.CONFIRMED);
  });

  it('cancel: HELD frees seats; CONFIRMED refunds until 2h before the show, then 409', async () => {
    const held = kit.service.hold(showId, { userId: 'u1', seats: ['A1'] });
    await kit.service.cancel(held.id, 'u1');
    expect(kit.service.seatMap(showId).counts.AVAILABLE).toBe(6);

    const b = kit.service.hold(showId, { userId: 'u1', seats: ['A2'] });
    await kit.service.confirm(b.id, 'u1', 'tok_ok');
    kit.clock.advance(7 * 60 * MINUTE); // show at 18:00, now 17:00
    expect(await errorOf(() => kit.service.cancel(b.id, 'u1'))).toMatchObject({ httpStatus: 409 });
  });

  it('a screen can’t run two overlapping shows (including the cleaning gap)', async () => {
    const { screenId, movie } = { screenId: kit.repos.shows.findByIdOrThrow(showId).screenId, movie: kit.repos.movies.findAll()[0] };
    // 18:00 + 169 min = 20:49, + 20 min cleaning = 21:09 IST
    const clash = await errorOf(() =>
      kit.catalog.createShow({ movieId: movie.id, screenId, startsAt: '2026-11-09T15:30:00.000Z', prices: { REGULAR: 1, RECLINER: 1 } }),
    );
    expect(clash).toMatchObject({ httpStatus: 409 });
    expect(
      kit.catalog.createShow({ movieId: movie.id, screenId, startsAt: '2026-11-09T15:40:00.000Z', prices: { REGULAR: 1, RECLINER: 1 } }).id,
    ).toBeTruthy();
  });
});
