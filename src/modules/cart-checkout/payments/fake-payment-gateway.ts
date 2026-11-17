import { Inject, Injectable, Logger } from '@nestjs/common';
import { sleep } from '../../../common/utils/sleep';
import { CHECKOUT_OPTIONS, type CheckoutOptions } from '../domain/checkout-options';
import { PaymentDeclinedError, type PaymentGateway } from '../domain/payment-gateway';

/** tok_decline → declined; anything else succeeds after the configured latency. */
@Injectable()
export class FakePaymentGateway implements PaymentGateway {
  private readonly logger = new Logger('FakeCheckoutPayments');
  private seq = 0;

  constructor(@Inject(CHECKOUT_OPTIONS) private readonly options: CheckoutOptions) {}

  async charge(reference: string, amountPaise: number, paymentToken: string) {
    if (this.options.paymentLatencyMs > 0) await sleep(this.options.paymentLatencyMs);
    if (paymentToken === 'tok_decline') {
      this.logger.warn(`declined ${reference} ₹${amountPaise / 100}`);
      throw new PaymentDeclinedError('Card declined');
    }
    const paymentId = `pay_${++this.seq}`;
    this.logger.log(`charged ${reference} ₹${amountPaise / 100} → ${paymentId}`);
    return { paymentId };
  }

  async refund(paymentId: string, amountPaise: number) {
    if (this.options.paymentLatencyMs > 0) await sleep(this.options.paymentLatencyMs);
    this.logger.log(`refunded ${paymentId} ₹${amountPaise / 100}`);
    return { refundId: `rf_${++this.seq}` };
  }
}
