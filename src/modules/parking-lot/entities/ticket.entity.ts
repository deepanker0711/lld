import { BaseEntity } from '../../../common/entities/base.entity';
import { SlotType, VehicleType } from '../domain/vehicle-type';

export enum TicketStatus {
  ACTIVE = 'ACTIVE',
  PAID = 'PAID',
}

/**
 * Created on park, closed on unpark. It is also the parking history: slots only know
 * who is there now, tickets know who was there and for how long.
 */
export class Ticket extends BaseEntity {
  lotId: string;
  /** Short number printed on the paper ticket, per lot: 1, 2, 3... */
  ticketNo: number;
  vehicleNumber: string;
  vehicleType: VehicleType;
  slotId: string;
  /** Copied so the ticket reads well on its own (and survives a re-layout). */
  slotCode: string;
  slotType: SlotType;
  entryAt: Date;
  exitAt: Date | null;
  /** Whole currency units (rupees). Money is never a float. */
  fee: number | null;
  durationMinutes: number | null;
  paymentId: string | null;
  status: TicketStatus;
}
