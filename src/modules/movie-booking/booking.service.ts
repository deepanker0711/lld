import { Inject, Injectable } from '@nestjs/common';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  GoneError,
  NotFoundError,
  UnprocessableError,
} from '../../common/errors/domain.errors';
import { Clock } from '../../common/utils/clock';
import { KeyedMutex } from '../../common/utils/keyed-mutex';
import { BOOKING_OPTIONS, type BookingOptions } from './domain/booking-options';
import { assertBookingTransition, BookingStatus } from './domain/booking-status';
import { PAYMENT_GATEWAY, PaymentDeclinedError, type PaymentGateway } from './domain/payment-gateway';
import { PRICING_STRATEGY, type PricingStrategy } from './domain/pricing.strategy';
import { SeatType } from './domain/seat';
import { HoldSeatsDto } from './dto/dto';
import { Booking } from './entities/entities';
import { BookingRepository, ScreenRepository, ShowRepository } from './repositories';

export type SeatStatus = 'AVAILABLE' | 'HELD' | 'BOOKED';

export interface SeatMapView {
  showId: string;
  startsAt: Date;
  counts: Record<SeatStatus, number>;
  rows: { row: string; type: SeatType; seats: { code: string; status: SeatStatus; pricePaise: number }[] }[];
}

@Injectable()
export class BookingService {
  constructor(
    private readonly shows: ShowRepository,
    private readonly screens: ScreenRepository,
    private readonly bookings: BookingRepository,
    @Inject(PRICING_STRATEGY) private readonly pricing: PricingStrategy,
    @Inject(PAYMENT_GATEWAY) private readonly payments: PaymentGateway,
    @Inject(BOOKING_OPTIONS) private readonly options: BookingOptions,
    private readonly clock: Clock,
    private readonly mutex: KeyedMutex,
  ) {}

  // ── Seat map ─────────────────────────────────────────────────────────

  seatMap(showId: string): SeatMapView {
    const show = this.shows.findByIdOrThrow(showId);
    const screen = this.screens.findByIdOrThrow(show.screenId);
    const quote = this.pricing.quote(screen.seats, show.prices, show.startsAt);
    const priceOf = new Map(quote.seats.map((s) => [s.code, s.pricePaise]));
    const counts: Record<SeatStatus, number> = { AVAILABLE: 0, HELD: 0, BOOKED: 0 };

    const rows = screen.layout.map((r) => ({
      row: r.row,
      type: r.type,
      seats: screen.seats
        .filter((s) => s.row === r.row)
        .map((s) => {
          const status = this.statusOf(show.id, s.code);
          counts[status]++;
          return { code: s.code, status, pricePaise: priceOf.get(s.code)! };
        }),
    }));
    return { showId: show.id, startsAt: show.startsAt, counts, rows };
  }

  private statusOf(showId: string, seatCode: string): SeatStatus {
    const booking = this.liveOwner(showId, seatCode);
    if (!booking) return 'AVAILABLE';
    return booking.status === BookingStatus.CONFIRMED ? 'BOOKED' : 'HELD';
  }

  /**
   * The booking holding this seat, or undefined. Expired holds are released here,
   * lazily, the moment anyone looks: no timer per hold, nothing to clean up on restart.
   */
  private liveOwner(showId: string, seatCode: string): Booking | undefined {
    const id = this.bookings.ownerOf(showId, seatCode);
    if (!id) return undefined;
    const booking = this.expireIfDue(this.bookings.findByIdOrThrow(id));
    return booking.status === BookingStatus.EXPIRED ? undefined : booking;
  }

  /** Only HELD can lapse. CONFIRMING (payment in flight) can't expire under the payment. */
  private expireIfDue(b: Booking): Booking {
    if (b.status === BookingStatus.HELD && b.holdExpiresAt.getTime() <= this.clock.now()) {
      this.bookings.free(b.showId, b.seatCodes, b.id);
      return this.move(b, BookingStatus.EXPIRED);
    }
    return b;
  }

  // ── Hold ─────────────────────────────────────────────────────────────

  /**
   * All-or-nothing and synchronous: checking every seat and occupying them happens in
   * one block, so two users can't both hold A7. With a database, this is one transaction
   * inserting (show_id, seat_code) rows under a unique constraint.
   */
  hold(showId: string, dto: HoldSeatsDto): Booking {
    const show = this.shows.findByIdOrThrow(showId);
    if (show.startsAt.getTime() <= this.clock.now()) throw new UnprocessableError('Show has already started');

    const codes = dto.seats;
    if (new Set(codes).size !== codes.length) throw new BadRequestError('Duplicate seats in the request');
    if (codes.length > this.options.maxSeatsPerBooking) {
      throw new UnprocessableError(`At most ${this.options.maxSeatsPerBooking} seats per booking`);
    }
    const screen = this.screens.findByIdOrThrow(show.screenId);
    const byCode = new Map(screen.seats.map((s) => [s.code, s]));
    const unknown = codes.filter((c) => !byCode.has(c));
    if (unknown.length) throw new BadRequestError(`No such seats on this screen: ${unknown.join(', ')}`, { unknown });

    const taken = codes.filter((c) => this.liveOwner(show.id, c));
    if (taken.length) throw new ConflictError(`Seats not available: ${taken.join(', ')}`, { taken });

    const booking = this.bookings.create({
      showId: show.id,
      userId: dto.userId,
      seatCodes: codes,
      quote: this.pricing.quote(codes.map((c) => byCode.get(c)!), show.prices, show.startsAt),
      status: BookingStatus.HELD,
      holdExpiresAt: new Date(this.clock.now() + this.options.holdMs),
      paymentId: null,
      history: [{ status: BookingStatus.HELD, at: this.clock.date() }],
    });
    this.bookings.occupy(show.id, codes, booking.id);
    return booking;
  }

  // ── Confirm ──────────────────────────────────────────────────────────

  /**
   * HELD → CONFIRMING before the await: a hold that lapses during a slow payment
   * would otherwise free the seats while the customer is being charged for them.
   */
  confirm(bookingId: string, userId: string, paymentToken: string): Promise<Booking> {
    return this.mutex.runExclusive(`booking:${bookingId}`, async () => {
      const booking = this.ownBooking(bookingId, userId);
      if (booking.status === BookingStatus.EXPIRED) {
        throw new GoneError('Hold expired; select seats again', { expiredAt: booking.holdExpiresAt });
      }
      assertBookingTransition(booking.status, BookingStatus.CONFIRMING, booking.id);
      const confirming = this.move(booking, BookingStatus.CONFIRMING);

      try {
        const { paymentId } = await this.payments.charge(booking.id, booking.quote.totalPaise, paymentToken);
        return this.move(confirming, BookingStatus.CONFIRMED, { paymentId });
      } catch (err) {
        // Back to HELD if there's time left to retry with another card, else let it go.
        if (confirming.holdExpiresAt.getTime() > this.clock.now()) {
          this.move(confirming, BookingStatus.HELD, {}, 'payment failed');
        } else {
          this.bookings.free(confirming.showId, confirming.seatCodes, confirming.id);
          this.move(confirming, BookingStatus.EXPIRED, {}, 'payment failed after hold expiry');
        }
        if (err instanceof PaymentDeclinedError) {
          throw new UnprocessableError(`Payment declined: ${err.message}`, { bookingId });
        }
        throw err;
      }
    });
  }

  // ── Cancel ───────────────────────────────────────────────────────────

  cancel(bookingId: string, userId: string): Promise<Booking> {
    return this.mutex.runExclusive(`booking:${bookingId}`, async () => {
      const booking = this.ownBooking(bookingId, userId);
      assertBookingTransition(booking.status, BookingStatus.CANCELLED, booking.id);

      if (booking.status === BookingStatus.CONFIRMED) {
        const show = this.shows.findByIdOrThrow(booking.showId);
        if (show.startsAt.getTime() - this.clock.now() < this.options.cancelCutoffMs) {
          throw new ConflictError(
            `Bookings can be cancelled up to ${this.options.cancelCutoffMs / 60_000} minutes before the show`,
            { startsAt: show.startsAt },
          );
        }
        await this.payments.refund(booking.paymentId!, booking.quote.totalPaise);
      }
      this.bookings.free(booking.showId, booking.seatCodes, booking.id);
      return this.move(booking, BookingStatus.CANCELLED, {}, booking.paymentId ? 'refunded' : undefined);
    });
  }

  get(bookingId: string): Booking {
    return this.expireIfDue(this.bookings.findByIdOrThrow(bookingId));
  }

  private ownBooking(bookingId: string, userId: string): Booking {
    const booking = this.bookings.findById(bookingId);
    if (!booking) throw new NotFoundError('Booking', bookingId);
    if (booking.userId !== userId) throw new ForbiddenError('This booking belongs to another user');
    return this.expireIfDue(booking);
  }

  private move(b: Booking, to: BookingStatus, patch: Partial<Booking> = {}, note?: string): Booking {
    assertBookingTransition(b.status, to, b.id);
    return this.bookings.update(b.id, {
      ...patch,
      status: to,
      history: [...b.history, { status: to, at: this.clock.date(), ...(note && { note }) }],
    });
  }
}
