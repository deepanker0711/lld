const MINUTE = 60_000;

export interface BookingOptions {
  holdMs: number;
  maxSeatsPerBooking: number;
  /** Cleaning gap after a show before the next one on the same screen. */
  turnaroundMs: number;
  /** Confirmed bookings can be cancelled (and refunded) only this long before the show. */
  cancelCutoffMs: number;
  paymentLatencyMs: number;
}

export const DEFAULT_BOOKING_OPTIONS: BookingOptions = {
  holdMs: 5 * MINUTE,
  maxSeatsPerBooking: 10,
  turnaroundMs: 20 * MINUTE,
  cancelCutoffMs: 120 * MINUTE,
  paymentLatencyMs: 100,
};

export const BOOKING_OPTIONS = Symbol('BOOKING_OPTIONS');
