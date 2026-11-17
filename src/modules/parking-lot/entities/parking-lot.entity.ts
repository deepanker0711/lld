import { BaseEntity } from '../../../common/entities/base.entity';
import { SlotType } from '../domain/vehicle-type';

/** Slot counts for one floor, as the lot was created. */
export type FloorLayout = Record<SlotType, number>;

export class ParkingLot extends BaseEntity {
  name: string;
  /** Index = floor number (0 = ground). */
  layout: FloorLayout[];
}
