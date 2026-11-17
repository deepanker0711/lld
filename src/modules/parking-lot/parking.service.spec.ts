import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CommonModule } from '../../common/common.module';
import { VehicleType as V } from './domain/vehicle-type';
import { TicketStatus } from './entities/ticket.entity';
import { ParkingLotModule } from './parking-lot.module';
import { ParkingService } from './parking.service';
import { createParkingKit, MINUTE, NOW } from './testing/parking-test-kit';

const floors = (...f: { bike?: number; car?: number; truck?: number }[]) =>
  f.map((x) => ({ bike: 0, car: 0, truck: 0, ...x }));

function errorOf(fn: () => unknown) {
  try {
    fn();
  } catch (e) {
    return e as { httpStatus: number; message: string; details?: unknown };
  }
  throw new Error('expected an error');
}

describe('ParkingService', () => {
  let kit: ReturnType<typeof createParkingKit>;
  beforeEach(() => (kit = createParkingKit()));

  describe('T2 create lot', () => {
    it('generates slots per floor and type with readable codes', () => {
      const lot = kit.service.createLot({
        name: 'HQ',
        floors: floors({ bike: 1, car: 2 }, { truck: 1 }),
      });
      expect(lot.id).toMatch(/^lot_/);
      expect(lot.slots.map((s) => s.code)).toEqual([
        'F0-B1',
        'F0-C1',
        'F0-C2',
        'F1-T1',
      ]);
      expect(lot.slots.every((s) => s.vehicleNumber === null)).toBe(true);
      expect(lot.layout).toEqual([
        { BIKE: 1, CAR: 2, TRUCK: 0 },
        { BIKE: 0, CAR: 0, TRUCK: 1 },
      ]);
    });

    it('rejects a lot with no slots at all', () => {
      expect(
        errorOf(() =>
          kit.service.createLot({ name: 'Empty', floors: floors({}) }),
        ),
      ).toMatchObject({
        httpStatus: 400,
        message: 'A parking lot needs at least one slot',
      });
    });
  });

  describe('T4 park', () => {
    it('issues a ticket for the nearest slot and occupies it', () => {
      const lot = kit.service.createLot({
        name: 'HQ',
        floors: floors({ car: 2 }, { car: 2 }),
      });
      const t1 = kit.service.park(lot.id, {
        vehicleNumber: 'KA01AB1234',
        vehicleType: V.CAR,
      });
      const t2 = kit.service.park(lot.id, {
        vehicleNumber: 'KA01AB5678',
        vehicleType: V.CAR,
      });

      expect(t1).toMatchObject({
        ticketNo: 1,
        slotCode: 'F0-C1',
        status: TicketStatus.ACTIVE,
        entryAt: new Date(NOW),
        fee: null,
      });
      expect(t2).toMatchObject({ ticketNo: 2, slotCode: 'F0-C2' });
      expect(kit.slots.findByIdOrThrow(t1.slotId)).toMatchObject({
        vehicleNumber: 'KA01AB1234',
        ticketId: t1.id,
      });
    });

    it('409 when the lot has no slot of that type', () => {
      const lot = kit.service.createLot({
        name: 'HQ',
        floors: floors({ bike: 1, car: 1 }),
      });
      kit.service.park(lot.id, {
        vehicleNumber: 'CAR0001',
        vehicleType: V.CAR,
      });
      expect(
        errorOf(() =>
          kit.service.park(lot.id, {
            vehicleNumber: 'CAR0002',
            vehicleType: V.CAR,
          }),
        ),
      ).toMatchObject({
        httpStatus: 409,
        message: 'No CAR slot available',
      });
      expect(
        errorOf(() =>
          kit.service.park(lot.id, {
            vehicleNumber: 'TRK0001',
            vehicleType: V.TRUCK,
          }),
        ),
      ).toMatchObject({
        message: 'No TRUCK slot available',
      });
    });

    it('a bike takes a CAR slot only when every BIKE slot is taken', () => {
      const lot = kit.service.createLot({
        name: 'HQ',
        floors: floors({ car: 1 }, { bike: 1 }),
      });
      const first = kit.service.park(lot.id, {
        vehicleNumber: 'BIKE001',
        vehicleType: V.BIKE,
      });
      const second = kit.service.park(lot.id, {
        vehicleNumber: 'BIKE002',
        vehicleType: V.BIKE,
      });
      // BIKE on floor 1 beats CAR on floor 0: fit preference comes before distance.
      expect([first.slotCode, second.slotCode]).toEqual(['F1-B1', 'F0-C1']);
      expect(second.slotType).toBe('CAR');
      expect(
        errorOf(() =>
          kit.service.park(lot.id, {
            vehicleNumber: 'BIKE003',
            vehicleType: V.BIKE,
          }),
        ),
      ).toMatchObject({
        message: 'No BIKE slot available (also checked CAR)',
      });
    });

    it('409 when the vehicle already has an active ticket, in this lot or another', () => {
      const a = kit.service.createLot({
        name: 'A',
        floors: floors({ car: 2 }),
      });
      const b = kit.service.createLot({
        name: 'B',
        floors: floors({ car: 2 }),
      });
      const ticket = kit.service.park(a.id, {
        vehicleNumber: 'KA01AB1234',
        vehicleType: V.CAR,
      });
      for (const lotId of [a.id, b.id]) {
        expect(
          errorOf(() =>
            kit.service.park(lotId, {
              vehicleNumber: 'KA01AB1234',
              vehicleType: V.CAR,
            }),
          ),
        ).toMatchObject({
          httpStatus: 409,
          details: { ticketId: ticket.id, lotId: a.id, slotCode: 'F0-C1' },
        });
      }
    });

    it('404 for an unknown lot', () => {
      expect(
        errorOf(() =>
          kit.service.park('lot_nope', {
            vehicleNumber: 'X1234',
            vehicleType: V.CAR,
          }),
        ),
      ).toMatchObject({
        httpStatus: 404,
      });
    });
  });

  describe('T5 unpark and fees', () => {
    it('charges by started hour using the clock, frees the slot, and closes the ticket', async () => {
      const lot = kit.service.createLot({
        name: 'HQ',
        floors: floors({ car: 1 }),
      });
      const ticket = kit.service.park(lot.id, {
        vehicleNumber: 'KA01AB1234',
        vehicleType: V.CAR,
      });

      kit.clock.advance(61 * MINUTE);
      const result = await kit.service.unpark(lot.id, ticket.id);

      expect(result).toMatchObject({
        fee: 100,
        durationMinutes: 61,
        billableHours: 2,
      });
      expect(result.ticket).toMatchObject({
        status: TicketStatus.PAID,
        exitAt: new Date(NOW + 61 * MINUTE),
        fee: 100,
        paymentId: 'pay_1',
      });
      expect(kit.payments.charges).toEqual([
        { reference: ticket.id, amount: 100 },
      ]);
      expect(kit.slots.findByIdOrThrow(ticket.slotId)).toMatchObject({
        vehicleNumber: null,
        ticketId: null,
      });

      // the slot and the vehicle are both free again
      const again = kit.service.park(lot.id, {
        vehicleNumber: 'KA01AB1234',
        vehicleType: V.CAR,
      });
      expect(again).toMatchObject({ slotCode: 'F0-C1', ticketNo: 2 });
    });

    it("409 on a second unpark, 404 for another lot's ticket or an unknown one", async () => {
      const a = kit.service.createLot({
        name: 'A',
        floors: floors({ car: 1 }),
      });
      const b = kit.service.createLot({
        name: 'B',
        floors: floors({ car: 1 }),
      });
      const ticket = kit.service.park(a.id, {
        vehicleNumber: 'KA01AB1234',
        vehicleType: V.CAR,
      });

      await expect(kit.service.unpark(b.id, ticket.id)).rejects.toMatchObject({
        httpStatus: 404,
      });
      await expect(kit.service.unpark(a.id, 'tkt_nope')).rejects.toMatchObject({
        httpStatus: 404,
      });
      await kit.service.unpark(a.id, ticket.id);
      await expect(kit.service.unpark(a.id, ticket.id)).rejects.toMatchObject({
        httpStatus: 409,
        message: `Ticket '${ticket.id}' is already paid`,
      });
      expect(kit.payments.charges).toHaveLength(1);
    });

    it('if the payment fails, the ticket stays ACTIVE and the car stays parked', async () => {
      const lot = kit.service.createLot({
        name: 'HQ',
        floors: floors({ car: 1 }),
      });
      const ticket = kit.service.park(lot.id, {
        vehicleNumber: 'KA01AB1234',
        vehicleType: V.CAR,
      });
      vi.spyOn(kit.payments, 'charge').mockRejectedValueOnce(
        new Error('card declined'),
      );

      await expect(kit.service.unpark(lot.id, ticket.id)).rejects.toThrow(
        'card declined',
      );
      expect(kit.service.getTicket(ticket.id).status).toBe(TicketStatus.ACTIVE);
      expect(kit.slots.findByIdOrThrow(ticket.slotId).vehicleNumber).toBe(
        'KA01AB1234',
      );
      await expect(
        kit.service.unpark(lot.id, ticket.id),
      ).resolves.toMatchObject({ fee: 50 });
    });
  });

  describe('T6 availability', () => {
    it('counts free slots per floor and type, live', () => {
      const lot = kit.service.createLot({
        name: 'HQ',
        floors: floors({ bike: 2, car: 1 }, { truck: 1 }),
      });
      kit.service.park(lot.id, {
        vehicleNumber: 'BIKE001',
        vehicleType: V.BIKE,
      });
      expect(kit.service.availability(lot.id)).toEqual([
        { floor: 0, BIKE: 1, CAR: 1, TRUCK: 0 },
        { floor: 1, BIKE: 0, CAR: 0, TRUCK: 1 },
      ]);
      expect(errorOf(() => kit.service.availability('lot_nope'))).toMatchObject(
        { httpStatus: 404 },
      );
    });
  });

  describe('T7 concurrency', () => {
    it('two exits for the same ticket at once: one charge, one 409', async () => {
      const lot = kit.service.createLot({
        name: 'HQ',
        floors: floors({ car: 1 }),
      });
      const ticket = kit.service.park(lot.id, {
        vehicleNumber: 'KA01AB1234',
        vehicleType: V.CAR,
      });
      kit.payments.hold = true;

      const first = kit.service.unpark(lot.id, ticket.id);
      const second = kit.service.unpark(lot.id, ticket.id);
      await new Promise((r) => setImmediate(r));
      expect(kit.payments.charges).toHaveLength(1); // the second is waiting on the lock, not charging
      kit.payments.release();

      const results = await Promise.allSettled([first, second]);
      expect(results.map((r) => r.status)).toEqual(['fulfilled', 'rejected']);
      expect((results[1] as PromiseRejectedResult).reason).toMatchObject({
        httpStatus: 409,
      });
      expect(kit.payments.charges).toHaveLength(1);
    });

    it('different tickets unpark in parallel (the lock is per ticket)', async () => {
      const lot = kit.service.createLot({
        name: 'HQ',
        floors: floors({ car: 2 }),
      });
      const a = kit.service.park(lot.id, {
        vehicleNumber: 'CAR0001',
        vehicleType: V.CAR,
      });
      const b = kit.service.park(lot.id, {
        vehicleNumber: 'CAR0002',
        vehicleType: V.CAR,
      });
      kit.payments.hold = true;

      const both = Promise.all([
        kit.service.unpark(lot.id, a.id),
        kit.service.unpark(lot.id, b.id),
      ]);
      await new Promise((r) => setImmediate(r));
      expect(kit.payments.charges).toHaveLength(2); // both reached the gateway
      kit.payments.release();
      await both;
    });

    it('two parks for the last slot: one ticket, one 409 (park has no await, so it cannot interleave)', async () => {
      const lot = kit.service.createLot({
        name: 'HQ',
        floors: floors({ car: 1 }),
      });
      const attempts = ['CAR0001', 'CAR0002'].map((vehicleNumber) =>
        Promise.resolve().then(() =>
          kit.service.park(lot.id, { vehicleNumber, vehicleType: V.CAR }),
        ),
      );
      const results = await Promise.allSettled(attempts);
      expect(results.map((r) => r.status).sort()).toEqual([
        'fulfilled',
        'rejected',
      ]);
      expect(kit.service.availability(lot.id)[0].CAR).toBe(0);
    });
  });
});

describe('ParkingLotModule wiring', () => {
  it('builds ParkingService with its strategies and gateway', async () => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const moduleRef = await Test.createTestingModule({
      imports: [CommonModule, ParkingLotModule],
    }).compile();
    const service = moduleRef.get(ParkingService);
    const lot = service.createLot({ name: 'HQ', floors: floors({ car: 1 }) });
    expect(
      service.park(lot.id, { vehicleNumber: 'KA01AB1234', vehicleType: V.CAR })
        .slotCode,
    ).toBe('F0-C1');
    vi.restoreAllMocks();
  });
});
