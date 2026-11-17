import { Inject, Injectable, Logger } from '@nestjs/common';
import { sleep } from '../../../common/utils/sleep';
import { RailsDeclinedError, type PaymentRails } from '../domain/payment-rails';
import { WALLET_OPTIONS, type WalletOptions } from '../domain/wallet-options';

/** tok_decline declines a top-up; a bank account ending in 0000 rejects a payout. */
@Injectable()
export class FakePaymentRails implements PaymentRails {
  private readonly logger = new Logger('FakePaymentRails');
  private seq = 0;

  constructor(@Inject(WALLET_OPTIONS) private readonly options: WalletOptions) {}

  async collect(reference: string, amountPaise: number, token: string) {
    await this.delay();
    if (token === 'tok_decline') throw new RailsDeclinedError('Card declined');
    this.logger.log(`collected ₹${amountPaise / 100} for ${reference}`);
    return { externalRef: `col_${++this.seq}` };
  }

  async payout(reference: string, amountPaise: number, bankAccount: string) {
    await this.delay();
    if (bankAccount.endsWith('0000')) throw new RailsDeclinedError('Bank account closed');
    this.logger.log(`paid out ₹${amountPaise / 100} for ${reference}`);
    return { externalRef: `pyt_${++this.seq}` };
  }

  private async delay() {
    if (this.options.gatewayLatencyMs > 0) await sleep(this.options.gatewayLatencyMs);
  }
}
