import { FakeClock } from '../../../common/utils/clock';
import { RailsDeclinedError, type PaymentRails } from '../domain/payment-rails';
import { DEFAULT_WALLET_OPTIONS } from '../domain/wallet-options';
import { LedgerRepository, TransactionRepository, WalletRepository } from '../repositories';
import { WalletService } from '../wallet.service';

export const NOW = Date.parse('2026-11-09T04:30:00.000Z');

export class RecordingRails implements PaymentRails {
  readonly collects: number[] = [];
  readonly payouts: number[] = [];
  hold = false;
  private waiting: (() => void)[] = [];
  async collect(_ref: string, amount: number, token: string) {
    this.collects.push(amount);
    if (this.hold) await new Promise<void>((r) => this.waiting.push(r));
    if (token === 'tok_decline') throw new RailsDeclinedError('Card declined');
    return { externalRef: `col_${this.collects.length}` };
  }
  async payout(_ref: string, amount: number, bank: string) {
    this.payouts.push(amount);
    if (this.hold) await new Promise<void>((r) => this.waiting.push(r));
    if (bank.endsWith('0000')) throw new RailsDeclinedError('Bank account closed');
    return { externalRef: `pyt_${this.payouts.length}` };
  }
  release() {
    this.waiting.splice(0).forEach((r) => r());
  }
}

export function createWalletKit() {
  const clock = new FakeClock(NOW);
  const options = { ...DEFAULT_WALLET_OPTIONS, gatewayLatencyMs: 0 };
  const rails = new RecordingRails();
  const ledger = new LedgerRepository();
  const service = new WalletService(new WalletRepository(), new TransactionRepository(), ledger, rails, options, clock);
  service.onModuleInit();
  return { clock, options, rails, ledger, service };
}
