import { FakeClock } from '../../../common/utils/clock';
import { SequenceGenerator } from '../../../common/utils/id.generator';
import { KeyedMutex } from '../../../common/utils/keyed-mutex';
import { HourlyFeeStrategy } from '../domain/fee.strategy';
import { DEFAULT_PARKING_OPTIONS } from '../domain/parking-options';
import type { PaymentGateway } from '../domain/payment-gateway';
import { NearestFirstStrategy } from '../domain/slot-allocation.strategy';
import { ParkingLotRepository } from '../parking-lot.repository';
import { ParkingService } from '../parking.service';
import { SlotRepository } from '../slot.repository';
import { TicketRepository } from '../ticket.repository';

export const NOW = Date.parse('2026-11-02T09:00:00.000Z');
export const MINUTE = 60_000;

/** Records every charge; resolves immediately unless `hold` is set, then waits for release(). */
export class RecordingPaymentGateway implements PaymentGateway {
  readonly charges: { reference: string; amount: number }[] = [];
  hold = false;
  private waiting: (() => void)[] = [];

  async charge(reference: string, amount: number) {
    this.charges.push({ reference, amount });
    if (this.hold) await new Promise<void>((r) => this.waiting.push(r));
    return { paymentId: `pay_${this.charges.length}` };
  }

  release(): void {
    this.waiting.splice(0).forEach((r) => r());
  }
}

/** Real services wired by hand: FakeClock for fees, a recording gateway for payments. */
export function createParkingKit() {
  const clock = new FakeClock(NOW);
  const payments = new RecordingPaymentGateway();
  const lots = new ParkingLotRepository();
  const slots = new SlotRepository();
  const tickets = new TicketRepository();
  const service = new ParkingService(
    lots,
    slots,
    tickets,
    new NearestFirstStrategy(),
    new HourlyFeeStrategy(DEFAULT_PARKING_OPTIONS.hourlyRates),
    payments,
    clock,
    new SequenceGenerator(),
    new KeyedMutex(),
  );
  return { clock, payments, lots, slots, tickets, service };
}
