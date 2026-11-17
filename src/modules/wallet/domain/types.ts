export enum WalletStatus {
  ACTIVE = 'ACTIVE',
  FROZEN = 'FROZEN',
}

export enum TxnKind {
  TOP_UP = 'TOP_UP',
  TRANSFER = 'TRANSFER',
  WITHDRAWAL = 'WITHDRAWAL',
}

/**
 *   TOP_UP:      PENDING ──(charge ok)──► SUCCESS     PENDING ──(declined)──► FAILED
 *   TRANSFER:    SUCCESS immediately (one synchronous block)
 *   WITHDRAWAL:  PENDING (money already debited) ──► SUCCESS | REVERSED (credited back)
 */
export enum TxnStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  REVERSED = 'REVERSED',
}

export enum EntryDirection {
  CREDIT = 'CREDIT',
  DEBIT = 'DEBIT',
}
