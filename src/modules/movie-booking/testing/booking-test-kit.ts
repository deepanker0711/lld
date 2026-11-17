import { FakeClock } from '../../../common/utils/clock';
import { KeyedMutex } from '../../../common/utils/keyed-mutex';
import { BookingService } from '../booking.service';
import { MovieCatalogService } from '../catalog.service';
import { DEFAULT_BOOKING_OPTIONS } from '../domain/booking-options';
import { PaymentDeclinedError, type PaymentGateway } from '../domain/payment-gateway';
import { StandardPricing } from '../domain/pricing.strategy';
import { SeatType } from '../domain/seat';
import { BookingRepository, CinemaRepository, MovieRepository, ScreenRepository, ShowRepository } from '../repositories';

/** Mon 2026-11-09 10:00 IST. */
export const NOW = Date.parse('2026-11-09T04:30:00.000Z');
export const MINUTE = 60_000;

export class RecordingGateway implements PaymentGateway {
  readonly charges: number[] = [];
  readonly refunds: string[] = [];
  hold = false;
  private waiting: (() => void)[] = [];
  async charge(_ref: string, amount: number, token: string) {
    this.charges.push(amount);
    if (this.hold) await new Promise<void>((r) => this.waiting.push(r));
    if (token === 'tok_decline') throw new PaymentDeclinedError('Card declined');
    return { paymentId: `pay_${this.charges.length}` };
  }
  async refund(paymentId: string) {
    this.refunds.push(paymentId);
  }
  release() {
    this.waiting.splice(0).forEach((r) => r());
  }
}

export function createBookingKit() {
  const clock = new FakeClock(NOW);
  const options = { ...DEFAULT_BOOKING_OPTIONS, paymentLatencyMs: 0 };
  const repos = {
    cinemas: new CinemaRepository(),
    screens: new ScreenRepository(),
    movies: new MovieRepository(),
    shows: new ShowRepository(),
    bookings: new BookingRepository(),
  };
  const payments = new RecordingGateway();
  const catalog = new MovieCatalogService(repos.cinemas, repos.screens, repos.movies, repos.shows, clock, options);
  const service = new BookingService(
    repos.shows,
    repos.screens,
    repos.bookings,
    new StandardPricing(),
    payments,
    options,
    clock,
    new KeyedMutex(),
  );

  /** PVR, one screen: row A = 4 REGULAR, row B = 2 RECLINER. Show at 18:00 IST (Monday). */
  function seed(startsAt = '2026-11-09T12:30:00.000Z') {
    const cinema = catalog.createCinema({
      name: 'PVR Forum',
      city: 'Bengaluru',
      screens: [{ name: 'Audi 1', rows: [{ row: 'A', seats: 4, type: SeatType.REGULAR }, { row: 'B', seats: 2, type: SeatType.RECLINER }] }],
    });
    const movie = catalog.createMovie({ title: 'Interstellar', durationMin: 169, language: 'English' });
    const show = catalog.createShow({
      movieId: movie.id,
      screenId: cinema.screens[0].id,
      startsAt,
      prices: { REGULAR: 200_00, RECLINER: 500_00 },
    });
    return { cinema, movie, show, screenId: cinema.screens[0].id };
  }

  return { clock, options, repos, payments, catalog, service, seed };
}
