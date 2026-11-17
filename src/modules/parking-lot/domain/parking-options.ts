import { VehicleType } from './vehicle-type';

export interface ParkingOptions {
  /** Rupees per started hour. */
  hourlyRates: Record<VehicleType, number>;
  /** Fake payment gateway: simulated network time per charge. */
  paymentLatencyMs: number;
}

export const DEFAULT_PARKING_OPTIONS: ParkingOptions = {
  hourlyRates: {
    [VehicleType.BIKE]: 20,
    [VehicleType.CAR]: 50,
    [VehicleType.TRUCK]: 100,
  },
  paymentLatencyMs: 100,
};

export const PARKING_OPTIONS = Symbol('PARKING_OPTIONS');
