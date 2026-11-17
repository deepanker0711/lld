import { CouponKind } from '../entities/coupon.entity';

/** Strategy per coupon kind. Amounts are integer paise. */
export interface DiscountStrategy {
  readonly kind: CouponKind;
  discount(subtotalPaise: number, value: number, maxDiscountPaise: number | null): number;
}

export const DISCOUNT_STRATEGIES = Symbol('DISCOUNT_STRATEGIES');

/** value = percent (1–100). Capped by maxDiscountPaise, e.g. "20% off up to ₹200". */
export class PercentOffStrategy implements DiscountStrategy {
  readonly kind = CouponKind.PERCENT;
  discount(subtotal: number, percent: number, cap: number | null): number {
    const raw = Math.floor((subtotal * percent) / 100);
    return Math.min(raw, cap ?? raw, subtotal);
  }
}

/** value = paise off. Never more than the subtotal. */
export class FlatOffStrategy implements DiscountStrategy {
  readonly kind = CouponKind.FLAT;
  discount(subtotal: number, paise: number): number {
    return Math.min(paise, subtotal);
  }
}

export const DISCOUNT_STRATEGY_CLASSES = [PercentOffStrategy, FlatOffStrategy];
