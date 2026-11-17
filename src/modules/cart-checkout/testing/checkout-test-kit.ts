import { FakeClock } from '../../../common/utils/clock';
import { KeyedMutex } from '../../../common/utils/keyed-mutex';
import { CartService } from '../cart.service';
import { CatalogService } from '../catalog.service';
import { CheckoutService } from '../checkout.service';
import { DEFAULT_CHECKOUT_OPTIONS } from '../domain/checkout-options';
import { FlatOffStrategy, PercentOffStrategy } from '../domain/discount.strategy';
import { PaymentDeclinedError, type PaymentGateway } from '../domain/payment-gateway';
import { PricingService } from '../pricing.service';
import { CartRepository, CouponRepository, OrderRepository, ProductRepository } from '../repositories';

export const NOW = Date.parse('2026-11-09T04:30:00.000Z');

/** Records charges; `hold` keeps them pending until release(). tok_decline declines. */
export class RecordingGateway implements PaymentGateway {
  readonly charges: { reference: string; amount: number }[] = [];
  readonly refunds: { paymentId: string; amount: number }[] = [];
  hold = false;
  private waiting: (() => void)[] = [];

  async charge(reference: string, amount: number, token: string) {
    this.charges.push({ reference, amount });
    if (this.hold) await new Promise<void>((r) => this.waiting.push(r));
    if (token === 'tok_decline') throw new PaymentDeclinedError('Card declined');
    return { paymentId: `pay_${this.charges.length}` };
  }

  async refund(paymentId: string, amount: number) {
    this.refunds.push({ paymentId, amount });
    return { refundId: `rf_${this.refunds.length}` };
  }

  release(): void {
    this.waiting.splice(0).forEach((r) => r());
  }
}

export function createCheckoutKit() {
  const clock = new FakeClock(NOW);
  const options = { ...DEFAULT_CHECKOUT_OPTIONS, paymentLatencyMs: 0 };
  const products = new ProductRepository();
  const coupons = new CouponRepository();
  const carts = new CartRepository();
  const orders = new OrderRepository();
  const payments = new RecordingGateway();
  const pricing = new PricingService([new PercentOffStrategy(), new FlatOffStrategy()], options, clock);
  const catalog = new CatalogService(products, coupons);
  const cart = new CartService(carts, products, coupons, pricing, options);
  const checkout = new CheckoutService(cart, products, coupons, orders, pricing, payments, clock, new KeyedMutex());
  return { clock, products, coupons, orders, payments, catalog, cart, checkout };
}
