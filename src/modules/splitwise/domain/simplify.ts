export interface Debt {
  from: string;
  to: string;
  amountPaise: number;
}

/**
 * Settle-up plan from net balances (positive = is owed, negative = owes).
 * Greedy: repeatedly match the biggest debtor with the biggest creditor; each step clears
 * at least one person, so there are at most n − 1 payments. (The true minimum number of
 * payments is NP-hard; greedy is what Splitwise-style apps ship.)
 */
export function simplifyDebts(net: Map<string, number>): Debt[] {
  const creditors = [...net].filter(([, v]) => v > 0).map(([id, v]) => ({ id, v }));
  const debtors = [...net].filter(([, v]) => v < 0).map(([id, v]) => ({ id, v: -v }));
  const byAmount = (a: { id: string; v: number }, b: { id: string; v: number }) => b.v - a.v || a.id.localeCompare(b.id);
  const debts: Debt[] = [];

  while (creditors.length && debtors.length) {
    creditors.sort(byAmount);
    debtors.sort(byAmount);
    const c = creditors[0];
    const d = debtors[0];
    const amount = Math.min(c.v, d.v);
    debts.push({ from: d.id, to: c.id, amountPaise: amount });
    c.v -= amount;
    d.v -= amount;
    if (c.v === 0) creditors.shift();
    if (d.v === 0) debtors.shift();
  }
  return debts;
}
