import { Inject, Injectable, Logger } from '@nestjs/common';
import { sleep } from '../../../common/utils/sleep';
import { BOOKING_OPTIONS, type BookingOptions } from '../domain/booking-options';
import { PaymentDeclinedError, type PaymentGateway } from '../domain/payment-gateway';

/** tok_decline → declined. */
@Injectable()
export class FakePaymentGateway implements PaymentGateway {
  private readonly logger = new Logger('FakeBookingPayments');
  private seq = 0;

  constructor(@Inject(BOOKING_OPTIONS) private readonly options: BookingOptions) {}

  async charge(reference: string, amountPaise: number, token: string) {
    if (this.options.paymentLatencyMs > 0) await sleep(this.options.paymentLatencyMs);
    if (token === 'tok_decline') throw new PaymentDeclinedError('Card declined');
    this.logger.log(`charged ${reference} ₹${amountPaise / 100}`);
    return { paymentId: `pay_${++this.seq}` };
  }

  async refund(paymentId: string, amountPaise: number) {
    if (this.options.paymentLatencyMs > 0) await sleep(this.options.paymentLatencyMs);
    this.logger.log(`refunded ${paymentId} ₹${amountPaise / 100}`);
  }
}
