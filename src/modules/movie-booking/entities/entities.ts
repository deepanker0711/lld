import { BaseEntity } from '../../../common/entities/base.entity';
import { BookingStatus } from '../domain/booking-status';
import { PriceQuote } from '../domain/pricing.strategy';
import { Seat, SeatRow, SeatType } from '../domain/seat';

export class Cinema extends BaseEntity {
  name: string;
  city: string;
}

export class Screen extends BaseEntity {
  cinemaId: string;
  name: string;
  layout: SeatRow[];
  /** Expanded once from the layout. */
  seats: Seat[];
}

export class Movie extends BaseEntity {
  title: string;
  durationMin: number;
  language: string;
}

export class Show extends BaseEntity {
  movieId: string;
  screenId: string;
  cinemaId: string;
  startsAt: Date;
  /** startsAt + duration. The screen is busy until endsAt + turnaround. */
  endsAt: Date;
  prices: Record<SeatType, number>;
}

export class Booking extends BaseEntity {
  showId: string;
  userId: string;
  seatCodes: string[];
  quote: PriceQuote;
  status: BookingStatus;
  holdExpiresAt: Date;
  paymentId: string | null;
  history: { status: BookingStatus; at: Date; note?: string }[];
}
