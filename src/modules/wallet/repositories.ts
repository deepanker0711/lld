import { Injectable } from '@nestjs/common';
import { InMemoryRepository } from '../../common/repository/in-memory.repository';
import { CreateInput } from '../../common/repository/repository.interface';
import { LedgerEntry, Wallet, WalletTransaction } from './entities/entities';

const push = (m: Map<string, string[]>, k: string, id: string) => m.set(k, [...(m.get(k) ?? []), id]);

@Injectable()
export class WalletRepository extends InMemoryRepository<Wallet> {
  private readonly byUser = new Map<string, string>();
  constructor() {
    super('Wallet', 'wal');
  }
  override create(data: CreateInput<Wallet>): Wallet {
    const w = super.create(data);
    this.byUser.set(w.userId, w.id);
    return w;
  }
  findByUser(userId: string): Wallet | undefined {
    const id = this.byUser.get(userId);
    return id ? this.findById(id) : undefined;
  }
}

@Injectable()
export class TransactionRepository extends InMemoryRepository<WalletTransaction> {
  private readonly byKey = new Map<string, string>();
  private readonly byWallet = new Map<string, string[]>();
  constructor() {
    super('Transaction', 'txn');
  }
  override create(data: CreateInput<WalletTransaction>): WalletTransaction {
    const t = super.create(data);
    const initiator = t.fromWalletId ?? t.toWalletId!;
    this.byKey.set(`${initiator}:${t.idempotencyKey}`, t.id);
    if (t.fromWalletId) push(this.byWallet, t.fromWalletId, t.id);
    if (t.toWalletId && t.toWalletId !== t.fromWalletId) push(this.byWallet, t.toWalletId, t.id);
    return t;
  }
  findByKey(walletId: string, key: string): WalletTransaction | undefined {
    const id = this.byKey.get(`${walletId}:${key}`);
    return id ? this.findById(id) : undefined;
  }
  findByWallet(walletId: string): WalletTransaction[] {
    return (this.byWallet.get(walletId) ?? []).map((id) => this.findByIdOrThrow(id));
  }
}

/** Append-only: no update or delete is ever called on entries. */
@Injectable()
export class LedgerRepository extends InMemoryRepository<LedgerEntry> {
  private readonly byWallet = new Map<string, string[]>();
  constructor() {
    super('Ledger entry', 'le');
  }
  override create(data: CreateInput<LedgerEntry>): LedgerEntry {
    const e = super.create(data);
    push(this.byWallet, e.walletId, e.id);
    return e;
  }
  findByWallet(walletId: string): LedgerEntry[] {
    return (this.byWallet.get(walletId) ?? []).map((id) => this.findByIdOrThrow(id));
  }
}
