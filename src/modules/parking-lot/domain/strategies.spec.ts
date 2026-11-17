import type { Slot } from '../entities/slot.entity';
import { HourlyFeeStrategy } from './fee.strategy';
import { NearestFirstStrategy } from './slot-allocation.strategy';
import {
  ALLOWED_SLOT_TYPES,
  slotCode,
  SlotType,
  VehicleType,
} from './vehicle-type';

const slot = (floor: number, number: number) =>
  ({ id: `${floor}-${number}`, floor, number }) as Slot;

describe('NearestFirstStrategy', () => {
  const strategy = new NearestFirstStrategy();

  it('picks the lowest floor, then the lowest number, whatever the input order', () => {
    expect(
      strategy.choose([slot(2, 1), slot(1, 3), slot(1, 2), slot(3, 1)])?.id,
    ).toBe('1-2');
  });

  it('returns undefined when nothing is free', () => {
    expect(strategy.choose([])).toBeUndefined();
  });
});

describe('HourlyFeeStrategy', () => {
  const fees = new HourlyFeeStrategy({ BIKE: 20, CAR: 50, TRUCK: 100 });
  const entry = new Date('2026-11-02T09:00:00Z');
  const after = (minutes: number) =>
    new Date(entry.getTime() + minutes * 60_000);

  it.each([
    [0, 1, 50],
    [59, 1, 50],
    [60, 1, 50],
    [61, 2, 100],
    [180, 3, 150],
    [181, 4, 200],
  ])('CAR for %i min → %i billable hour(s), ₹%i', (minutes, hours, fee) => {
    expect(fees.quote(VehicleType.CAR, entry, after(minutes))).toEqual({
      fee,
      billableHours: hours,
      durationMinutes: minutes,
    });
  });

  it('uses the rate of the vehicle type and never goes negative', () => {
    expect(fees.quote(VehicleType.TRUCK, entry, after(90)).fee).toBe(200);
    expect(fees.quote(VehicleType.BIKE, entry, after(90)).fee).toBe(40);
    expect(fees.quote(VehicleType.CAR, entry, after(-5))).toMatchObject({
      fee: 50,
      durationMinutes: 0,
    });
  });
});

describe('vehicle → slot fit', () => {
  it('bike prefers BIKE then CAR; car and truck only their own type', () => {
    expect(ALLOWED_SLOT_TYPES.BIKE).toEqual([SlotType.BIKE, SlotType.CAR]);
    expect(ALLOWED_SLOT_TYPES.CAR).toEqual([SlotType.CAR]);
    expect(ALLOWED_SLOT_TYPES.TRUCK).toEqual([SlotType.TRUCK]);
    expect(slotCode(0, SlotType.CAR, 1)).toBe('F0-C1');
  });
});
