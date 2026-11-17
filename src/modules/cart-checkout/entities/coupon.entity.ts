import { BaseEntity } from '../../../common/entities/base.entity';

export enum CouponKind {
  PERCENT = 'PERCENT',
  FLAT = 'FLAT',
}

/** id = code (upper-cased), so lookup is a Map get. */
export class Coupon extends BaseEntity {
  kind: CouponKind;
  /** Percent for PERCENT, paise for FLAT. */
  value: number;
  minSubtotalPaise: number;
  maxDiscountPaise: number | null;
  expiresAt: Date | null;
  usageLimit: number | null;
  /** Counted when an order is placed; given back if its payment fails. */
  usedCount: number;
}
