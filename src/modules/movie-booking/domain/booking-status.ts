import { ConflictError } from '../../../common/errors/domain.errors';

export enum BookingStatus {
  HELD = 'HELD',
  /** Payment in flight: the hold can't expire under it. */
  CONFIRMING = 'CONFIRMING',
  CONFIRMED = 'CONFIRMED',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED',
}

/**
 *   ──► HELD ──┬──► CONFIRMING ──┬──► CONFIRMED ──► CANCELLED  (guard: > 2h before the show)
 *              │                 └──► HELD          (payment declined, hold still valid)
 *              ├──► EXPIRED       (lazily, when read after holdExpiresAt)
 *              └──► CANCELLED
 */
export const BOOKING_TRANSITIONS: Record<BookingStatus, readonly BookingStatus[]> = {
  [BookingStatus.HELD]: [BookingStatus.CONFIRMING, BookingStatus.EXPIRED, BookingStatus.CANCELLED],
  [BookingStatus.CONFIRMING]: [BookingStatus.CONFIRMED, BookingStatus.HELD, BookingStatus.EXPIRED],
  [BookingStatus.CONFIRMED]: [BookingStatus.CANCELLED],
  [BookingStatus.EXPIRED]: [],
  [BookingStatus.CANCELLED]: [],
};

/** Statuses that occupy seats. */
export const SEAT_HOLDING_STATUSES: readonly BookingStatus[] = [
  BookingStatus.HELD,
  BookingStatus.CONFIRMING,
  BookingStatus.CONFIRMED,
];

export function assertBookingTransition(from: BookingStatus, to: BookingStatus, id: string): void {
  const allowed = BOOKING_TRANSITIONS[from];
  if (!allowed.includes(to)) {
    throw new ConflictError(`Booking '${id}' cannot move from ${from} to ${to}`, { from, to, allowed });
  }
}
