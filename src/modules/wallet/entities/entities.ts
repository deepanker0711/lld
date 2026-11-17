import { BaseEntity } from '../../../common/entities/base.entity';
import { EntryDirection, TxnKind, TxnStatus, WalletStatus } from '../domain/types';

export class Wallet extends BaseEntity {
  userId: string;
  currency: 'INR';
  /** Cached sum of this wallet's ledger entries. reconcile() proves they agree. */
  balancePaise: number;
  status: WalletStatus;
}

/**
 * The business event: "Asha sent Ravi ₹500". Idempotency lives here.
 */
export class WalletTransaction extends BaseEntity {
  kind: TxnKind;
  status: TxnStatus;
  amountPaise: number;
  fromWalletId: string | null;
  toWalletId: string | null;
  /** Scoped to the initiating wallet: (walletId, key) is unique. */
  idempotencyKey: string;
  /** Hash of the request body: same key + different body = client bug → 422. */
  fingerprint: string;
  note: string | null;
  /** Business time from the Clock (createdAt is the storage time). Daily limits use this. */
  at: Date;
  externalRef: string | null;
  failureReason: string | null;
}

/**
 * Double entry: every money movement writes entries whose CREDITs and DEBITs balance.
 * Append-only: a mistake is fixed with a new reversing entry, never an edit.
 */
export class LedgerEntry extends BaseEntity {
  walletId: string;
  txnId: string;
  direction: EntryDirection;
  amountPaise: number;
  balanceAfterPaise: number;
  description: string;
}
