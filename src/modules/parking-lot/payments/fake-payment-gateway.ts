import { Inject, Injectable, Logger } from '@nestjs/common';
import { generateId } from '../../../common/utils/id.generator';
import { sleep } from '../../../common/utils/sleep';
import type { PaymentGateway } from '../domain/payment-gateway';
import {
  PARKING_OPTIONS,
  type ParkingOptions,
} from '../domain/parking-options';

/** Always succeeds after a short delay. Stands in for Razorpay/Stripe/the exit-gate POS. */
@Injectable()
export class FakePaymentGateway implements PaymentGateway {
  private readonly logger = new Logger(FakePaymentGateway.name);

  constructor(
    @Inject(PARKING_OPTIONS) private readonly options: ParkingOptions,
  ) {}

  async charge(
    reference: string,
    amount: number,
  ): Promise<{ paymentId: string }> {
    if (this.options.paymentLatencyMs > 0)
      await sleep(this.options.paymentLatencyMs);
    const paymentId = generateId('pay');
    this.logger.log(`charged ₹${amount} for ${reference} (${paymentId})`);
    return { paymentId };
  }
}
