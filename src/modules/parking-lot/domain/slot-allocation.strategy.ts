import type { Slot } from '../entities/slot.entity';

/**
 * Strategy: given the free slots of one type, pick one (or none).
 * The service decides WHICH types to try (ALLOWED_SLOT_TYPES); the strategy only
 * decides WHERE. Swapping the policy = one provider line in the module.
 */
export interface SlotAllocationStrategy {
  choose(freeSlots: readonly Slot[]): Slot | undefined;
}

export const SLOT_ALLOCATION_STRATEGY = Symbol('SLOT_ALLOCATION_STRATEGY');

/** Lowest floor, then lowest number: the slot closest to the entrance. */
export class NearestFirstStrategy implements SlotAllocationStrategy {
  choose(freeSlots: readonly Slot[]): Slot | undefined {
    let best: Slot | undefined;
    for (const slot of freeSlots) {
      if (
        !best ||
        slot.floor < best.floor ||
        (slot.floor === best.floor && slot.number < best.number)
      ) {
        best = slot;
      }
    }
    return best;
  }
}
