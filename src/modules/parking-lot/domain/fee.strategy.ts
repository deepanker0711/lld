import { VehicleType } from './vehicle-type';

export interface FeeQuote {
  fee: number;
  /** Actual time parked, rounded up to the minute. */
  durationMinutes: number;
  /** What was charged for. */
  billableHours: number;
}

/** Strategy: how much a stay costs. Hourly today; flat day rate, weekend pricing, etc. later. */
export interface FeeStrategy {
  quote(vehicleType: VehicleType, entryAt: Date, exitAt: Date): FeeQuote;
}

export const FEE_STRATEGY = Symbol('FEE_STRATEGY');

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/**
 * Rate per started hour, by vehicle type. The first hour is the minimum:
 *   0 min → 1 h · 59 min → 1 h · 60 min → 1 h · 61 min → 2 h · 3 h → 3 h
 */
export class HourlyFeeStrategy implements FeeStrategy {
  constructor(private readonly ratePerHour: Record<VehicleType, number>) {}

  quote(vehicleType: VehicleType, entryAt: Date, exitAt: Date): FeeQuote {
    const ms = Math.max(0, exitAt.getTime() - entryAt.getTime()); // clock skew never gives a negative fee
    const billableHours = Math.max(1, Math.ceil(ms / HOUR));
    return {
      fee: billableHours * this.ratePerHour[vehicleType],
      durationMinutes: Math.ceil(ms / MINUTE),
      billableHours,
    };
  }
}
