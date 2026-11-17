import { BaseEntity } from '../../../common/entities/base.entity';
import { SlotType } from '../domain/vehicle-type';

/**
 * One physical space. Occupied = vehicleNumber is set. There's no separate "isFree" flag
 * to keep in sync: the occupant fields are the state.
 */
export class Slot extends BaseEntity {
  lotId: string;
  floor: number;
  /** 1-based within (floor, type): F0-C1, F0-C2, ... */
  number: number;
  type: SlotType;
  /** F0-C1 */
  code: string;
  vehicleNumber: string | null;
  ticketId: string | null;
}
