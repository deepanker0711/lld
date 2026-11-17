import { Injectable } from '@nestjs/common';
import { InMemoryRepository } from '../../common/repository/in-memory.repository';
import { CreateInput } from '../../common/repository/repository.interface';
import { SlotType } from './domain/vehicle-type';
import { Slot } from './entities/slot.entity';

/**
 * Secondary index lotId → slots, so a lot's queries don't scan every lot's slots.
 * findFree is still O(slots in the lot); fine for hundreds of slots. For very large lots
 * keep a min-heap of free slots per (lot, type) instead (see the handbook follow-ups).
 * In SQL: index on (lot_id, type) WHERE vehicle_number IS NULL.
 */
@Injectable()
export class SlotRepository extends InMemoryRepository<Slot> {
  private readonly byLot = new Map<string, Slot[]>();

  constructor() {
    super('Slot', 'slot');
  }

  override create(data: CreateInput<Slot>): Slot {
    const slot = super.create(data);
    const list = this.byLot.get(slot.lotId) ?? [];
    list.push(slot);
    this.byLot.set(slot.lotId, list);
    return slot;
  }

  findByLot(lotId: string): Slot[] {
    return [...(this.byLot.get(lotId) ?? [])];
  }

  findFree(lotId: string, type: SlotType): Slot[] {
    return (this.byLot.get(lotId) ?? []).filter(
      (s) => s.type === type && s.vehicleNumber === null,
    );
  }
}
