import { Inject, Injectable } from '@nestjs/common';
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from '../../common/errors/domain.errors';
import { Clock } from '../../common/utils/clock';
import { SequenceGenerator } from '../../common/utils/id.generator';
import { KeyedMutex } from '../../common/utils/keyed-mutex';
import { FEE_STRATEGY, type FeeStrategy } from './domain/fee.strategy';
import { PAYMENT_GATEWAY, type PaymentGateway } from './domain/payment-gateway';
import {
  SLOT_ALLOCATION_STRATEGY,
  type SlotAllocationStrategy,
} from './domain/slot-allocation.strategy';
import {
  ALL_SLOT_TYPES,
  ALLOWED_SLOT_TYPES,
  slotCode,
  SlotType,
  VehicleType,
} from './domain/vehicle-type';
import { CreateParkingLotDto } from './dto/create-parking-lot.dto';
import { ParkVehicleDto } from './dto/park-vehicle.dto';
import { FloorLayout, ParkingLot } from './entities/parking-lot.entity';
import { Slot } from './entities/slot.entity';
import { Ticket, TicketStatus } from './entities/ticket.entity';
import { ParkingLotRepository } from './parking-lot.repository';
import { SlotRepository } from './slot.repository';
import { TicketRepository } from './ticket.repository';

export type FloorAvailability = { floor: number } & Record<SlotType, number>;

export interface UnparkResult {
  ticket: Ticket;
  fee: number;
  durationMinutes: number;
  billableHours: number;
}

@Injectable()
export class ParkingService {
  constructor(
    private readonly lots: ParkingLotRepository,
    private readonly slots: SlotRepository,
    private readonly tickets: TicketRepository,
    @Inject(SLOT_ALLOCATION_STRATEGY)
    private readonly allocation: SlotAllocationStrategy,
    @Inject(FEE_STRATEGY) private readonly fees: FeeStrategy,
    @Inject(PAYMENT_GATEWAY) private readonly payments: PaymentGateway,
    private readonly clock: Clock,
    private readonly sequence: SequenceGenerator,
    private readonly mutex: KeyedMutex,
  ) {}

  // ── Lots ─────────────────────────────────────────────────────────────

  createLot(dto: CreateParkingLotDto): ParkingLot & { slots: Slot[] } {
    const layout: FloorLayout[] = dto.floors.map((f) => ({
      [SlotType.BIKE]: f.bike,
      [SlotType.CAR]: f.car,
      [SlotType.TRUCK]: f.truck,
    }));
    const total = layout.reduce(
      (sum, floor) => sum + ALL_SLOT_TYPES.reduce((s, t) => s + floor[t], 0),
      0,
    );
    if (total === 0)
      throw new BadRequestError('A parking lot needs at least one slot');

    const lot = this.lots.create({ name: dto.name, layout });
    const slots: Slot[] = [];
    layout.forEach((floor, floorNo) => {
      for (const type of ALL_SLOT_TYPES) {
        for (let n = 1; n <= floor[type]; n++) {
          slots.push(
            this.slots.create({
              lotId: lot.id,
              floor: floorNo,
              number: n,
              type,
              code: slotCode(floorNo, type, n),
              vehicleNumber: null,
              ticketId: null,
            }),
          );
        }
      }
    });
    return { ...lot, slots };
  }

  listLots(): ParkingLot[] {
    return this.lots.findAll();
  }

  getLot(id: string): ParkingLot & { slots: Slot[] } {
    const lot = this.lots.findByIdOrThrow(id);
    return { ...lot, slots: this.slots.findByLot(id) };
  }

  /** Free slots per floor and type. Computed from the slots, never stored as counters. */
  availability(lotId: string): FloorAvailability[] {
    const lot = this.lots.findByIdOrThrow(lotId);
    const rows: FloorAvailability[] = lot.layout.map((_, floor) => ({
      floor,
      [SlotType.BIKE]: 0,
      [SlotType.CAR]: 0,
      [SlotType.TRUCK]: 0,
    }));
    for (const slot of this.slots.findByLot(lotId)) {
      if (slot.vehicleNumber === null) rows[slot.floor][slot.type]++;
    }
    return rows;
  }

  // ── Park ─────────────────────────────────────────────────────────────

  /**
   * Synchronous on purpose, so no lock is needed in one process: Node runs this whole
   * method without interruption, so "find a free slot" and "occupy it" can't interleave
   * with another request. Add an `await` between them (camera check, prepaid booking
   * lookup) and two requests could take the same slot: then wrap it in
   * this.mutex.runExclusive(`lot:${lotId}`, ...).
   */
  park(lotId: string, dto: ParkVehicleDto): Ticket {
    const lot = this.lots.findByIdOrThrow(lotId);

    const existing = this.tickets.findActiveByVehicle(dto.vehicleNumber);
    if (existing) {
      throw new ConflictError(
        `Vehicle ${dto.vehicleNumber} is already parked`,
        {
          ticketId: existing.id,
          lotId: existing.lotId,
          slotCode: existing.slotCode,
        },
      );
    }

    const slot = this.allocate(lot.id, dto.vehicleType);
    const ticket = this.tickets.create({
      lotId: lot.id,
      ticketNo: this.sequence.next(`ticket:${lot.id}`),
      vehicleNumber: dto.vehicleNumber,
      vehicleType: dto.vehicleType,
      slotId: slot.id,
      slotCode: slot.code,
      slotType: slot.type,
      entryAt: this.clock.date(),
      exitAt: null,
      fee: null,
      durationMinutes: null,
      paymentId: null,
      status: TicketStatus.ACTIVE,
    });
    this.slots.update(slot.id, {
      vehicleNumber: dto.vehicleNumber,
      ticketId: ticket.id,
    });
    return ticket;
  }

  /** Try each allowed slot type in preference order; the strategy picks within a type. */
  private allocate(lotId: string, vehicleType: VehicleType): Slot {
    const allowed = ALLOWED_SLOT_TYPES[vehicleType];
    for (const type of allowed) {
      const slot = this.allocation.choose(this.slots.findFree(lotId, type));
      if (slot) return slot;
    }
    const tried =
      allowed.length > 1
        ? ` (also checked ${allowed.slice(1).join(', ')})`
        : '';
    throw new ConflictError(`No ${vehicleType} slot available${tried}`);
  }

  // ── Unpark ───────────────────────────────────────────────────────────

  /**
   * The lock matters here because of the `await`: two exit requests for the same ticket
   * would both see ACTIVE, both charge, then both mark PAID. Under the per-ticket lock the
   * second one waits, re-reads the ticket, sees PAID and gets 409 without being charged.
   * Different tickets still unpark in parallel.
   */
  unpark(lotId: string, ticketId: string): Promise<UnparkResult> {
    return this.mutex.runExclusive(`ticket:${ticketId}`, async () => {
      const ticket = this.tickets.findById(ticketId);
      // Another lot's ticket is "not found" here: don't confirm it exists elsewhere.
      if (!ticket || ticket.lotId !== lotId)
        throw new NotFoundError('Ticket', ticketId);
      if (ticket.status === TicketStatus.PAID) {
        throw new ConflictError(`Ticket '${ticketId}' is already paid`, {
          exitAt: ticket.exitAt,
          fee: ticket.fee,
        });
      }

      const exitAt = this.clock.date();
      const quote = this.fees.quote(ticket.vehicleType, ticket.entryAt, exitAt);
      // If this throws, nothing below runs: the ticket stays ACTIVE and the car stays parked.
      const { paymentId } = await this.payments.charge(ticket.id, quote.fee);

      const paid = this.tickets.update(ticket.id, {
        status: TicketStatus.PAID,
        exitAt,
        fee: quote.fee,
        durationMinutes: quote.durationMinutes,
        paymentId,
      });
      this.slots.update(ticket.slotId, { vehicleNumber: null, ticketId: null });
      return {
        ticket: paid,
        fee: quote.fee,
        durationMinutes: quote.durationMinutes,
        billableHours: quote.billableHours,
      };
    });
  }

  getTicket(id: string): Ticket {
    return this.tickets.findByIdOrThrow(id);
  }
}
