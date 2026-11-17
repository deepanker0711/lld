export enum VehicleType {
  BIKE = 'BIKE',
  CAR = 'CAR',
  TRUCK = 'TRUCK',
}

export enum SlotType {
  BIKE = 'BIKE',
  CAR = 'CAR',
  TRUCK = 'TRUCK',
}

export const ALL_SLOT_TYPES = Object.values(SlotType);

/**
 * Which slot types a vehicle may use, in order of preference. The fit rule is data,
 * not if/else: "a bike may use a CAR slot when no BIKE slot is free" is the CAR entry
 * in the BIKE list. A truck never fits a car slot, so its list has one entry.
 */
export const ALLOWED_SLOT_TYPES: Record<VehicleType, readonly SlotType[]> = {
  [VehicleType.BIKE]: [SlotType.BIKE, SlotType.CAR],
  [VehicleType.CAR]: [SlotType.CAR],
  [VehicleType.TRUCK]: [SlotType.TRUCK],
};

const LETTER: Record<SlotType, string> = {
  [SlotType.BIKE]: 'B',
  [SlotType.CAR]: 'C',
  [SlotType.TRUCK]: 'T',
};

/** Human-readable slot label painted on the floor: F0-C1 = ground floor, car slot 1. */
export function slotCode(
  floor: number,
  type: SlotType,
  number: number,
): string {
  return `F${floor}-${LETTER[type]}${number}`;
}
