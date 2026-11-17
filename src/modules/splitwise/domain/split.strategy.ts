import { BadRequestError } from '../../../common/errors/domain.errors';

export enum SplitType {
  EQUAL = 'EQUAL',
  EXACT = 'EXACT',
  PERCENT = 'PERCENT',
  SHARES = 'SHARES',
}

export interface SplitInput {
  memberId: string;
  /** EXACT: paise. PERCENT: percent (up to 2 decimals). SHARES: weight. EQUAL: ignored. */
  value?: number;
}

export interface Share {
  memberId: string;
  owedPaise: number;
}

/** Strategy per split type. Output always sums to exactly the total (integer paise). */
export interface SplitStrategy {
  readonly type: SplitType;
  split(totalPaise: number, inputs: SplitInput[]): Share[];
}

export const SPLIT_STRATEGIES = Symbol('SPLIT_STRATEGIES');

/**
 * Integer apportionment by weights (largest remainder): floor each share, then hand the
 * leftover paise one by one to the largest fractional parts (ties: input order).
 * ₹100 / 3 → 3334, 3333, 3333. Nobody can say we lost or invented a paisa.
 */
export function apportion(totalPaise: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  const exact = weights.map((w) => (totalPaise * w) / sum);
  const floors = exact.map(Math.floor);
  let left = totalPaise - floors.reduce((a, b) => a + b, 0);
  const order = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (left-- <= 0) break;
    floors[i]++;
  }
  return floors;
}

export class EqualSplit implements SplitStrategy {
  readonly type = SplitType.EQUAL;
  split(total: number, inputs: SplitInput[]): Share[] {
    const amounts = apportion(total, inputs.map(() => 1));
    return inputs.map((p, i) => ({ memberId: p.memberId, owedPaise: amounts[i] }));
  }
}

export class ExactSplit implements SplitStrategy {
  readonly type = SplitType.EXACT;
  split(total: number, inputs: SplitInput[]): Share[] {
    const values = inputs.map((p) => p.value);
    if (values.some((v) => v === undefined || !Number.isInteger(v) || v < 0)) {
      throw new BadRequestError('EXACT split needs a non-negative integer paise value for every member');
    }
    const sum = (values as number[]).reduce((a, b) => a + b, 0);
    if (sum !== total) throw new BadRequestError(`EXACT amounts add up to ${sum}, not ${total}`, { sum, total });
    return inputs.map((p) => ({ memberId: p.memberId, owedPaise: p.value! }));
  }
}

export class PercentSplit implements SplitStrategy {
  readonly type = SplitType.PERCENT;
  split(total: number, inputs: SplitInput[]): Share[] {
    // Work in basis points so 33.33 + 33.33 + 33.34 is exactly 10000.
    const bps = inputs.map((p) => Math.round((p.value ?? NaN) * 100));
    if (bps.some((b) => !Number.isFinite(b) || b < 0)) throw new BadRequestError('PERCENT split needs a percent for every member');
    const sum = bps.reduce((a, b) => a + b, 0);
    if (sum !== 10_000) throw new BadRequestError(`Percentages add up to ${sum / 100}, not 100`);
    const amounts = apportion(total, bps);
    return inputs.map((p, i) => ({ memberId: p.memberId, owedPaise: amounts[i] }));
  }
}

export class SharesSplit implements SplitStrategy {
  readonly type = SplitType.SHARES;
  split(total: number, inputs: SplitInput[]): Share[] {
    const w = inputs.map((p) => p.value);
    if (w.some((v) => v === undefined || !Number.isInteger(v) || v < 1)) {
      throw new BadRequestError('SHARES split needs a positive integer weight for every member');
    }
    const amounts = apportion(total, w as number[]);
    return inputs.map((p, i) => ({ memberId: p.memberId, owedPaise: amounts[i] }));
  }
}

export const SPLIT_STRATEGY_CLASSES = [EqualSplit, ExactSplit, PercentSplit, SharesSplit];
