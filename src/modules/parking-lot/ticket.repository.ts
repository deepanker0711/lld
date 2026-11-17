import { Injectable } from '@nestjs/common';
import { InMemoryRepository } from '../../common/repository/in-memory.repository';
import {
  CreateInput,
  UpdateInput,
} from '../../common/repository/repository.interface';
import { Ticket, TicketStatus } from './entities/ticket.entity';

/**
 * Index vehicleNumber → ACTIVE ticket id, so "is this car already parked?" is O(1).
 * Kept in sync here, in the repository, so no service can forget to update it.
 * In SQL: UNIQUE (vehicle_number) WHERE status = 'ACTIVE' — the database enforces the rule.
 */
@Injectable()
export class TicketRepository extends InMemoryRepository<Ticket> {
  private readonly activeByVehicle = new Map<string, string>();

  constructor() {
    super('Ticket', 'tkt');
  }

  override create(data: CreateInput<Ticket>): Ticket {
    const ticket = super.create(data);
    if (ticket.status === TicketStatus.ACTIVE) {
      this.activeByVehicle.set(ticket.vehicleNumber, ticket.id);
    }
    return ticket;
  }

  override update(id: string, patch: UpdateInput<Ticket>): Ticket {
    const ticket = super.update(id, patch);
    if (
      ticket.status !== TicketStatus.ACTIVE &&
      this.activeByVehicle.get(ticket.vehicleNumber) === ticket.id
    ) {
      this.activeByVehicle.delete(ticket.vehicleNumber);
    }
    return ticket;
  }

  findActiveByVehicle(vehicleNumber: string): Ticket | undefined {
    const id = this.activeByVehicle.get(vehicleNumber);
    return id === undefined ? undefined : this.findById(id);
  }
}
