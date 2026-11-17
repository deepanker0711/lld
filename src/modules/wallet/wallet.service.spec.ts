import { TxnStatus, WalletStatus } from './domain/types';
import { createWalletKit } from './testing/wallet-test-kit';
import { EXTERNAL_WALLET_ID } from './wallet.service';

async function errorOf(fn: () => unknown) {
  try {
    await fn();
  } catch (e) {
    return e as { httpStatus: number; message: string; details?: unknown };
  }
  throw new Error('expected an error');
}

const k = (n: number) => `key-${String(n).padStart(8, '0')}`;

describe('WalletService', () => {
  let kit: ReturnType<typeof createWalletKit>;
  let asha: string;
  let ravi: string;

  beforeEach(async () => {
    kit = createWalletKit();
    asha = kit.service.create('asha').id;
    ravi = kit.service.create('ravi').id;
    await kit.service.topUp(asha, k(1), { amountPaise: 1_000_00, paymentToken: 'tok_ok' });
  });

  afterEach(() => {
    // Every test must leave the books balanced.
    expect(kit.service.checkLedger().ok).toBe(true);
    for (const id of [asha, ravi]) expect(kit.service.reconcile(id).ok).toBe(true);
  });

  it('one wallet per user', async () => {
    expect(await errorOf(() => kit.service.create('asha'))).toMatchObject({ httpStatus: 409 });
  });

  it('top-up credits the wallet and debits the external account', () => {
    expect(kit.service.get(asha).balancePaise).toBe(1_000_00);
    expect(kit.ledger.findByWallet(EXTERNAL_WALLET_ID).map((e) => [e.direction, e.amountPaise])).toEqual([['DEBIT', 1_000_00]]);
  });

  it('a retried top-up with the same key is not charged twice, even while the first is in flight', async () => {
    kit.rails.hold = true;
    const first = kit.service.topUp(ravi, k(2), { amountPaise: 500_00, paymentToken: 'tok_ok' });
    const retry = await kit.service.topUp(ravi, k(2), { amountPaise: 500_00, paymentToken: 'tok_ok' });
    expect(retry).toMatchObject({ replayed: true, transaction: { status: TxnStatus.PENDING } });
    kit.rails.release();
    await first;
    expect(kit.rails.collects).toEqual([1_000_00, 500_00]);
    expect(kit.service.get(ravi).balancePaise).toBe(500_00);
  });

  it('same key, different amount → 422', async () => {
    expect(await errorOf(() => kit.service.topUp(asha, k(1), { amountPaise: 1, paymentToken: 'tok_ok' }))).toMatchObject({
      httpStatus: 422,
      message: 'Idempotency-Key was already used with a different request',
    });
  });

  it('a declined top-up records FAILED and changes nothing', async () => {
    expect(await errorOf(() => kit.service.topUp(ravi, k(3), { amountPaise: 100, paymentToken: 'tok_decline' }))).toMatchObject({ httpStatus: 422 });
    expect(kit.service.transactions(ravi)[0].status).toBe(TxnStatus.FAILED);
    expect(kit.service.get(ravi).balancePaise).toBe(0);
  });

  it('transfer moves money with two entries; insufficient funds and same-wallet are rejected', async () => {
    const { transaction } = kit.service.transfer(asha, k(4), { toWalletId: ravi, amountPaise: 300_00, note: 'lunch' });
    expect(transaction.status).toBe(TxnStatus.SUCCESS);
    expect(kit.service.get(asha).balancePaise).toBe(700_00);
    expect(kit.service.get(ravi).balancePaise).toBe(300_00);
    expect(kit.ledger.findAll().filter((e) => e.txnId === transaction.id)).toHaveLength(2);

    expect(await errorOf(() => kit.service.transfer(asha, k(5), { toWalletId: ravi, amountPaise: 800_00 }))).toMatchObject({
      httpStatus: 422,
      details: { balancePaise: 700_00, requestedPaise: 800_00 },
    });
    expect(await errorOf(() => kit.service.transfer(asha, k(6), { toWalletId: asha, amountPaise: 1 }))).toMatchObject({ httpStatus: 400 });
  });

  it('a frozen wallet can’t send or receive', async () => {
    kit.service.setStatus(ravi, WalletStatus.FROZEN);
    expect(await errorOf(() => kit.service.transfer(asha, k(7), { toWalletId: ravi, amountPaise: 1 }))).toMatchObject({ httpStatus: 422 });
  });

  it('daily outgoing limit counts transfers in the company day', async () => {
    kit.options.dailyOutgoingLimitPaise = 500_00;
    kit.service.transfer(asha, k(8), { toWalletId: ravi, amountPaise: 400_00 });
    expect(await errorOf(() => kit.service.transfer(asha, k(9), { toWalletId: ravi, amountPaise: 200_00 }))).toMatchObject({
      httpStatus: 422,
      details: { usedTodayPaise: 400_00 },
    });
    kit.clock.advance(24 * 3600_000);
    expect(kit.service.transfer(asha, k(10), { toWalletId: ravi, amountPaise: 200_00 }).transaction.status).toBe(TxnStatus.SUCCESS);
  });

  it('withdrawal debits before the bank call, so two in flight can’t overdraw', async () => {
    kit.rails.hold = true;
    const a = kit.service.withdraw(asha, k(11), { amountPaise: 800_00, bankAccount: '123456789' });
    const b = await errorOf(() => kit.service.withdraw(asha, k(12), { amountPaise: 800_00, bankAccount: '123456789' }));
    expect(b).toMatchObject({ httpStatus: 422, message: 'Insufficient balance' });
    kit.rails.release();
    expect((await a).transaction.status).toBe(TxnStatus.SUCCESS);
    expect(kit.service.get(asha).balancePaise).toBe(200_00);
  });

  it('a rejected payout is reversed with a new entry, not by editing the old one', async () => {
    expect(await errorOf(() => kit.service.withdraw(asha, k(13), { amountPaise: 250_00, bankAccount: '111110000' }))).toMatchObject({ httpStatus: 422 });
    expect(kit.service.get(asha).balancePaise).toBe(1_000_00);
    const entries = kit.service.statement(asha, { page: 1, limit: 10 }).items.map((e) => [e.direction, e.description]);
    expect(entries.slice(0, 2)).toEqual([
      ['CREDIT', 'Reversal: Bank account closed'],
      ['DEBIT', 'Withdrawal to bank'],
    ]);
    expect(kit.service.transactions(asha)[0].status).toBe(TxnStatus.REVERSED);
  });
});
