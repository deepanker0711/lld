import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  UnprocessableError,
} from '../../common/errors/domain.errors';
import { type Page, paginate, PaginationDto } from '../../common/dto/pagination.dto';
import { Clock } from '../../common/utils/clock';
import { PAYMENT_RAILS, RailsDeclinedError, type PaymentRails } from './domain/payment-rails';
import { EntryDirection, TxnKind, TxnStatus, WalletStatus } from './domain/types';
import { WALLET_OPTIONS, type WalletOptions } from './domain/wallet-options';
import { TopUpDto, TransferDto, WithdrawDto } from './dto/dto';
import { LedgerEntry, Wallet, WalletTransaction } from './entities/entities';
import { LedgerRepository, TransactionRepository, WalletRepository } from './repositories';

/** The other side of every external movement. Its balance is negative: money owed to users. */
export const EXTERNAL_WALLET_ID = 'wal_external';

export interface TxnResult {
  transaction: WalletTransaction;
  replayed: boolean;
}

/**
 * Rules of the ledger:
 * - Integer paise only.
 * - Balance changes ONLY through post(), which writes the entries and the cached balance together.
 * - Each money movement is one synchronous block: check balance → write entries.
 *   With Postgres: one transaction, SELECT … FOR UPDATE on the wallets in id order.
 * - Anything that calls the outside world records a PENDING transaction BEFORE the
 *   await; that row is what makes retries with the same Idempotency-Key safe.
 */
@Injectable()
export class WalletService implements OnModuleInit {
  constructor(
    private readonly wallets: WalletRepository,
    private readonly txns: TransactionRepository,
    private readonly ledger: LedgerRepository,
    @Inject(PAYMENT_RAILS) private readonly rails: PaymentRails,
    @Inject(WALLET_OPTIONS) private readonly options: WalletOptions,
    private readonly clock: Clock,
  ) {}

  onModuleInit(): void {
    if (!this.wallets.exists(EXTERNAL_WALLET_ID)) {
      this.wallets.create({ id: EXTERNAL_WALLET_ID, userId: '__external__', currency: 'INR', balancePaise: 0, status: WalletStatus.ACTIVE });
    }
  }

  // ── Wallets ──────────────────────────────────────────────────────────

  create(userId: string): Wallet {
    if (this.wallets.findByUser(userId)) throw new ConflictError(`User '${userId}' already has a wallet`);
    return this.wallets.create({ userId, currency: 'INR', balancePaise: 0, status: WalletStatus.ACTIVE });
  }

  get(id: string): Wallet {
    if (id === EXTERNAL_WALLET_ID) throw new NotFoundError('Wallet', id);
    return this.wallets.findByIdOrThrow(id);
  }

  setStatus(id: string, status: WalletStatus): Wallet {
    this.get(id);
    return this.wallets.update(id, { status });
  }

  // ── Top-up (external → wallet) ───────────────────────────────────────

  async topUp(walletId: string, key: string | undefined, dto: TopUpDto): Promise<TxnResult> {
    const idem = this.requireKey(key);
    const wallet = this.get(walletId);
    const replay = this.replay(walletId, idem, { op: 'TOP_UP', amount: dto.amountPaise });
    if (replay) return replay;

    this.assertActive(wallet);
    this.assertTxnSize(dto.amountPaise);
    if (wallet.balancePaise + dto.amountPaise > this.options.maxBalancePaise) {
      throw new UnprocessableError('Top-up would exceed the wallet balance limit', {
        balancePaise: wallet.balancePaise,
        maxBalancePaise: this.options.maxBalancePaise,
      });
    }

    // Recorded BEFORE the await: a retry with the same key now finds it and doesn't charge again.
    const txn = this.newTxn(TxnKind.TOP_UP, TxnStatus.PENDING, dto.amountPaise, null, walletId, idem, { op: 'TOP_UP', amount: dto.amountPaise });
    try {
      const { externalRef } = await this.rails.collect(txn.id, dto.amountPaise, dto.paymentToken);
      // The money is ours now: credit even if the wallet was frozen meanwhile (freeze blocks spending).
      this.post(txn, EXTERNAL_WALLET_ID, walletId, dto.amountPaise, 'Top-up');
      return { transaction: this.txns.update(txn.id, { status: TxnStatus.SUCCESS, externalRef }), replayed: false };
    } catch (err) {
      const reason = err instanceof RailsDeclinedError ? err.message : 'Payment error';
      this.txns.update(txn.id, { status: TxnStatus.FAILED, failureReason: reason });
      if (err instanceof RailsDeclinedError) throw new UnprocessableError(`Top-up failed: ${reason}`, { transactionId: txn.id });
      throw err;
    }
  }

  // ── Transfer (wallet → wallet) ───────────────────────────────────────

  /** Fully synchronous: the balance check and both entries can't interleave with another transfer. */
  transfer(fromId: string, key: string | undefined, dto: TransferDto): TxnResult {
    const idem = this.requireKey(key);
    const from = this.get(fromId);
    const fp = { op: 'TRANSFER', to: dto.toWalletId, amount: dto.amountPaise };
    const replay = this.replay(fromId, idem, fp);
    if (replay) return replay;

    if (dto.toWalletId === fromId) throw new BadRequestError('Cannot transfer to the same wallet');
    const to = this.get(dto.toWalletId);
    this.assertActive(from);
    this.assertActive(to);
    this.assertTxnSize(dto.amountPaise);
    this.assertDailyLimit(from, dto.amountPaise);
    this.assertFunds(from, dto.amountPaise);
    if (to.balancePaise + dto.amountPaise > this.options.maxBalancePaise) {
      throw new UnprocessableError('Recipient wallet would exceed its balance limit');
    }

    const txn = this.newTxn(TxnKind.TRANSFER, TxnStatus.SUCCESS, dto.amountPaise, from.id, to.id, idem, fp, dto.note ?? null);
    this.post(txn, from.id, to.id, dto.amountPaise, dto.note ? `Transfer: ${dto.note}` : 'Transfer');
    return { transaction: txn, replayed: false };
  }

  // ── Withdrawal (wallet → bank) ───────────────────────────────────────

  /**
   * Debit FIRST (synchronously), then call the bank. Two withdrawals can't both spend
   * the same rupees. If the payout fails, a reversing entry gives the money back.
   */
  async withdraw(walletId: string, key: string | undefined, dto: WithdrawDto): Promise<TxnResult> {
    const idem = this.requireKey(key);
    const wallet = this.get(walletId);
    const fp = { op: 'WITHDRAWAL', amount: dto.amountPaise, bank: dto.bankAccount };
    const replay = this.replay(walletId, idem, fp);
    if (replay) return replay;

    this.assertActive(wallet);
    this.assertTxnSize(dto.amountPaise);
    this.assertDailyLimit(wallet, dto.amountPaise);
    this.assertFunds(wallet, dto.amountPaise);

    const txn = this.newTxn(TxnKind.WITHDRAWAL, TxnStatus.PENDING, dto.amountPaise, walletId, null, idem, fp);
    this.post(txn, walletId, EXTERNAL_WALLET_ID, dto.amountPaise, 'Withdrawal to bank');
    try {
      const { externalRef } = await this.rails.payout(txn.id, dto.amountPaise, dto.bankAccount);
      return { transaction: this.txns.update(txn.id, { status: TxnStatus.SUCCESS, externalRef }), replayed: false };
    } catch (err) {
      const reason = err instanceof RailsDeclinedError ? err.message : 'Payout error';
      this.post(txn, EXTERNAL_WALLET_ID, walletId, dto.amountPaise, `Reversal: ${reason}`);
      this.txns.update(txn.id, { status: TxnStatus.REVERSED, failureReason: reason });
      if (err instanceof RailsDeclinedError) throw new UnprocessableError(`Withdrawal failed: ${reason}; amount returned`, { transactionId: txn.id });
      throw err;
    }
  }

  // ── Reads ────────────────────────────────────────────────────────────

  statement(walletId: string, page: PaginationDto): Page<LedgerEntry> {
    this.get(walletId);
    return paginate(this.ledger.findByWallet(walletId).reverse(), page);
  }

  transactions(walletId: string): WalletTransaction[] {
    this.get(walletId);
    return this.txns.findByWallet(walletId).reverse();
  }

  transaction(id: string): WalletTransaction {
    return this.txns.findByIdOrThrow(id);
  }

  /** Cached balance vs. the ledger. Run nightly in production; alert on any mismatch. */
  reconcile(walletId: string): { walletId: string; balancePaise: number; ledgerPaise: number; ok: boolean } {
    const wallet = this.get(walletId);
    const ledgerPaise = this.sumEntries(this.ledger.findByWallet(walletId));
    return { walletId, balancePaise: wallet.balancePaise, ledgerPaise, ok: ledgerPaise === wallet.balancePaise };
  }

  /** Double-entry invariant across everything, including the external account: Σ = 0. */
  checkLedger(): { entries: number; netPaise: number; ok: boolean } {
    const all = this.ledger.findAll();
    const netPaise = this.sumEntries(all);
    return { entries: all.length, netPaise, ok: netPaise === 0 };
  }

  // ── Internals ────────────────────────────────────────────────────────

  /** The only code that changes a balance. Writes a DEBIT and a CREDIT that sum to zero. */
  private post(txn: WalletTransaction, debitId: string, creditId: string, amount: number, description: string): void {
    const debit = this.wallets.findByIdOrThrow(debitId);
    const credit = this.wallets.findByIdOrThrow(creditId);
    const debitAfter = debit.balancePaise - amount;
    const creditAfter = credit.balancePaise + amount;
    this.wallets.update(debit.id, { balancePaise: debitAfter });
    this.wallets.update(credit.id, { balancePaise: creditAfter });
    this.ledger.create({ walletId: debit.id, txnId: txn.id, direction: EntryDirection.DEBIT, amountPaise: amount, balanceAfterPaise: debitAfter, description });
    this.ledger.create({ walletId: credit.id, txnId: txn.id, direction: EntryDirection.CREDIT, amountPaise: amount, balanceAfterPaise: creditAfter, description });
  }

  private newTxn(
    kind: TxnKind,
    status: TxnStatus,
    amountPaise: number,
    fromWalletId: string | null,
    toWalletId: string | null,
    idempotencyKey: string,
    fingerprint: object,
    note: string | null = null,
  ): WalletTransaction {
    return this.txns.create({
      kind,
      status,
      amountPaise,
      fromWalletId,
      toWalletId,
      idempotencyKey,
      fingerprint: this.fingerprint(fingerprint),
      note,
      at: this.clock.date(),
      externalRef: null,
      failureReason: null,
    });
  }

  /** Same key + same request → the original result. Same key + different request → 422. */
  private replay(walletId: string, key: string, request: object): TxnResult | null {
    const existing = this.txns.findByKey(walletId, key);
    if (!existing) return null;
    if (existing.fingerprint !== this.fingerprint(request)) {
      throw new UnprocessableError('Idempotency-Key was already used with a different request', { transactionId: existing.id });
    }
    return { transaction: existing, replayed: true };
  }

  private fingerprint(request: object): string {
    return createHash('sha256').update(JSON.stringify(request)).digest('hex').slice(0, 16);
  }

  private requireKey(key: string | undefined): string {
    if (!key || !/^[A-Za-z0-9_-]{8,64}$/.test(key)) {
      throw new BadRequestError('Idempotency-Key header is required (8-64 letters, digits, _ or -)');
    }
    return key;
  }

  private assertActive(w: Wallet): void {
    if (w.status !== WalletStatus.ACTIVE) throw new UnprocessableError(`Wallet '${w.id}' is ${w.status}`);
  }

  private assertTxnSize(amount: number): void {
    if (amount > this.options.maxTxnPaise) {
      throw new UnprocessableError(`Amount exceeds the per-transaction limit of ₹${this.options.maxTxnPaise / 100}`);
    }
  }

  private assertFunds(w: Wallet, amount: number): void {
    if (w.balancePaise < amount) {
      throw new UnprocessableError('Insufficient balance', { balancePaise: w.balancePaise, requestedPaise: amount });
    }
  }

  /** Outgoing today (company time zone), counting pending withdrawals, not reversed ones. */
  private assertDailyLimit(w: Wallet, amount: number): void {
    const today = this.dayOf(this.clock.date());
    const usedPaise = this.txns
      .findByWallet(w.id)
      .filter(
        (t) =>
          t.fromWalletId === w.id &&
          (t.status === TxnStatus.SUCCESS || t.status === TxnStatus.PENDING) &&
          this.dayOf(t.at) === today,
      )
      .reduce((s, t) => s + t.amountPaise, 0);
    if (usedPaise + amount > this.options.dailyOutgoingLimitPaise) {
      throw new UnprocessableError('Daily outgoing limit reached', {
        usedTodayPaise: usedPaise,
        limitPaise: this.options.dailyOutgoingLimitPaise,
      });
    }
  }

  private dayOf(d: Date): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: this.options.timeZone }).format(d);
  }

  private sumEntries(entries: LedgerEntry[]): number {
    return entries.reduce((s, e) => s + (e.direction === EntryDirection.CREDIT ? e.amountPaise : -e.amountPaise), 0);
  }
}
