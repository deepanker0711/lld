import { Inject, Injectable } from '@nestjs/common';
import { UnprocessableError } from '../../common/errors/domain.errors';
import { Clock } from '../../common/utils/clock';
import { CHECKOUT_OPTIONS, type CheckoutOptions } from './domain/checkout-options';
import { DISCOUNT_STRATEGIES, type DiscountStrategy } from './domain/discount.strategy';
import { Coupon, CouponKind } from './entities/coupon.entity';
import { OrderTotals } from './entities/order.entity';

/**
 * Money is integer paise end to end: no floats, so ₹0.1 + ₹0.2 can't become 0.30000000000000004.
 * Order of operations: subtotal → discount → tax on the discounted amount → total.
 */
@Injectable()
export class PricingService {
  private readonly strategies = new Map<CouponKind, DiscountStrategy>();

  constructor(
    @Inject(DISCOUNT_STRATEGIES) strategies: DiscountStrategy[],
    @Inject(CHECKOUT_OPTIONS) private readonly options: CheckoutOptions,
    private readonly clock: Clock,
  ) {
    for (const s of strategies) this.strategies.set(s.kind, s);
    const missing = Object.values(CouponKind).filter((k) => !this.strategies.has(k));
    if (missing.length) throw new Error(`No discount strategy for: ${missing.join(', ')}`);
  }

  totals(subtotalPaise: number, coupon: Coupon | null): OrderTotals {
    const discountPaise = coupon
      ? this.strategies.get(coupon.kind)!.discount(subtotalPaise, coupon.value, coupon.maxDiscountPaise)
      : 0;
    const taxable = subtotalPaise - discountPaise;
    const taxPaise = Math.round((taxable * this.options.taxBps) / 10_000);
    return { subtotalPaise, discountPaise, taxPaise, totalPaise: taxable + taxPaise };
  }

  /** Why a coupon can't be used right now, or null. Checked when applied AND at checkout. */
  couponProblem(coupon: Coupon, subtotalPaise: number): string | null {
    if (coupon.expiresAt && coupon.expiresAt.getTime() <= this.clock.now()) return `Coupon ${coupon.id} has expired`;
    if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) return `Coupon ${coupon.id} is fully used`;
    if (subtotalPaise < coupon.minSubtotalPaise) {
      return `Coupon ${coupon.id} needs a subtotal of at least ₹${coupon.minSubtotalPaise / 100}`;
    }
    return null;
  }

  assertCouponUsable(coupon: Coupon, subtotalPaise: number): void {
    const problem = this.couponProblem(coupon, subtotalPaise);
    if (problem) throw new UnprocessableError(problem, { coupon: coupon.id });
  }
}
