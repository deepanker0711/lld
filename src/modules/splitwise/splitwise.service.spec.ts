import { apportion } from './domain/split.strategy';
import { simplifyDebts } from './domain/simplify';
import { SplitType } from './domain/split.strategy';
import { createSplitwiseKit } from './testing/splitwise-test-kit';

function errorOf(fn: () => unknown) {
  try {
    fn();
  } catch (e) {
    return e as { httpStatus: number; message: string; details?: unknown };
  }
  throw new Error('expected an error');
}

describe('Splitwise', () => {
  let kit: ReturnType<typeof createSplitwiseKit>;
  beforeEach(() => (kit = createSplitwiseKit()));
  const netOf = (id: string) => kit.service.balances(kit.groupId).net.find((n) => n.memberId === id)!.netPaise;

  describe('splitting', () => {
    it('apportion never loses or invents a paisa', () => {
      expect(apportion(10000, [1, 1, 1])).toEqual([3334, 3333, 3333]);
      expect(apportion(100, [1, 2])).toEqual([33, 67]);
      for (const total of [1, 7, 999, 12345]) {
        expect(apportion(total, [3, 1, 1, 2]).reduce((a, b) => a + b)).toBe(total);
      }
    });

    it('EQUAL ₹1000 between 3 → 33334 + 33333 + 33333', () => {
      const { a, b, c } = kit;
      const e = kit.service.addExpense(kit.groupId, {
        description: 'Dinner', paidBy: a, amountPaise: 1_000_00, splitType: SplitType.EQUAL,
        splits: [{ memberId: a }, { memberId: b }, { memberId: c }],
      });
      expect(e.shares.map((s) => s.owedPaise)).toEqual([33334, 33333, 33333]);
      expect(netOf(a)).toBe(66666);
    });

    it('EXACT must add up; PERCENT must be 100; SHARES by weight', () => {
      const { a, b, c } = kit;
      const base = { description: 'x', paidBy: a, amountPaise: 900_00 };
      expect(errorOf(() => kit.service.addExpense(kit.groupId, { ...base, splitType: SplitType.EXACT, splits: [{ memberId: a, value: 100 }, { memberId: b, value: 100 }] }))).toMatchObject({ httpStatus: 400 });
      expect(errorOf(() => kit.service.addExpense(kit.groupId, { ...base, splitType: SplitType.PERCENT, splits: [{ memberId: a, value: 50 }, { memberId: b, value: 40 }] }))).toMatchObject({ httpStatus: 400 });

      const pct = kit.service.addExpense(kit.groupId, { ...base, splitType: SplitType.PERCENT, splits: [{ memberId: a, value: 33.33 }, { memberId: b, value: 33.33 }, { memberId: c, value: 33.34 }] });
      expect(pct.shares.reduce((s, x) => s + x.owedPaise, 0)).toBe(900_00);

      const shares = kit.service.addExpense(kit.groupId, { ...base, splitType: SplitType.SHARES, splits: [{ memberId: b, value: 2 }, { memberId: c, value: 1 }] });
      expect(shares.shares.map((s) => s.owedPaise)).toEqual([600_00, 300_00]);
    });

    it('everyone in the expense must be in the group', () => {
      expect(errorOf(() => kit.service.addExpense(kit.groupId, { description: 'x', paidBy: kit.d, amountPaise: 100, splitType: SplitType.EQUAL, splits: [{ memberId: kit.a }] }))).toMatchObject({ httpStatus: 422 });
    });
  });

  describe('balances', () => {
    beforeEach(() => {
      const { a, b, c } = kit;
      // Asha pays 900 for all three, Ravi pays 300 for all three.
      kit.service.addExpense(kit.groupId, { description: 'Hotel', paidBy: a, amountPaise: 900_00, splitType: SplitType.EQUAL, splits: [{ memberId: a }, { memberId: b }, { memberId: c }] });
      kit.service.addExpense(kit.groupId, { description: 'Cab', paidBy: b, amountPaise: 300_00, splitType: SplitType.EQUAL, splits: [{ memberId: a }, { memberId: b }, { memberId: c }] });
    });

    it('net sums to zero; simplified needs fewer payments than pairwise', () => {
      const bal = kit.service.balances(kit.groupId);
      expect(bal.net.map((n) => n.netPaise)).toEqual([500_00, -100_00, -400_00]);
      expect(bal.net.reduce((s, n) => s + n.netPaise, 0)).toBe(0);
      // Ravi→Asha 200 (300 − 100), Meera→Asha 300, Meera→Ravi 100: 3 payments.
      expect(bal.pairwise).toEqual([
        { from: kit.b, to: kit.a, amountPaise: 200_00 },
        { from: kit.c, to: kit.a, amountPaise: 300_00 },
        { from: kit.c, to: kit.b, amountPaise: 100_00 },
      ]);
      expect(bal.simplified).toEqual([
        { from: kit.c, to: kit.a, amountPaise: 400_00 },
        { from: kit.b, to: kit.a, amountPaise: 100_00 },
      ]);
    });

    it('settling reduces the debt; overpaying is 422', () => {
      expect(errorOf(() => kit.service.settle(kit.groupId, { from: kit.b, to: kit.a, amountPaise: 200_00 }))).toMatchObject({
        httpStatus: 422,
        details: { maxPaise: 100_00 },
      });
      kit.service.settle(kit.groupId, { from: kit.b, to: kit.a, amountPaise: 100_00 });
      expect(netOf(kit.b)).toBe(0);
      expect(kit.service.balances(kit.groupId).simplified).toEqual([{ from: kit.c, to: kit.a, amountPaise: 400_00 }]);
    });

    it('deleting an expense updates balances (they are derived)', () => {
      const cab = kit.service.listExpenses(kit.groupId)[0];
      kit.service.deleteExpense(kit.groupId, cab.id);
      expect(netOf(kit.a)).toBe(600_00);
    });

    it('you can’t leave with an open balance', () => {
      expect(errorOf(() => kit.service.removeMember(kit.groupId, kit.c))).toMatchObject({ httpStatus: 422 });
    });
  });

  it('simplify: a chain A→B→C collapses to A→C', () => {
    expect(simplifyDebts(new Map([['A', -100], ['B', 0], ['C', 100]]))).toEqual([{ from: 'A', to: 'C', amountPaise: 100 }]);
  });
});
