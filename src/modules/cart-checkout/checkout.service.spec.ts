import { CouponKind } from './entities/coupon.entity';
import { OrderStatus } from './domain/order-status';
import { createCheckoutKit } from './testing/checkout-test-kit';

async function errorOf(fn: () => unknown) {
  try {
    await fn();
  } catch (e) {
    return e as { httpStatus: number; message: string; details?: unknown };
  }
  throw new Error('expected an error');
}

const KEY = 'key-00000001';

describe('Cart & checkout', () => {
  let kit: ReturnType<typeof createCheckoutKit>;
  let phone: string;
  let case_: string;

  beforeEach(() => {
    kit = createCheckoutKit();
    phone = kit.catalog.createProduct({ sku: 'PHONE-1', name: 'Phone', pricePaise: 1_000_00, stock: 2 }).id;
    case_ = kit.catalog.createProduct({ sku: 'CASE-1', name: 'Case', pricePaise: 250_00, stock: 50 }).id;
  });

  describe('cart', () => {
    it('prices live, merges repeated adds, and computes discount then 18% tax', () => {
      kit.cart.addItem('u1', phone, 1);
      kit.cart.addItem('u1', case_, 1);
      const view = kit.cart.addItem('u1', case_, 1);
      expect(view.lines.map((l) => [l.sku, l.qty])).toEqual([['PHONE-1', 1], ['CASE-1', 2]]);
      expect(view.totals).toEqual({ subtotalPaise: 1_500_00, discountPaise: 0, taxPaise: 270_00, totalPaise: 1_770_00 });

      kit.catalog.updateProduct(case_, { pricePaise: 200_00 });
      expect(kit.cart.view('u1').totals.subtotalPaise).toBe(1_400_00);
    });

    it('409 when asking for more than is in stock; 422 above the per-line limit', async () => {
      expect(await errorOf(() => kit.cart.addItem('u1', phone, 3))).toMatchObject({
        httpStatus: 409,
        details: { requested: 3, available: 2 },
      });
      expect(await errorOf(() => kit.cart.addItem('u1', case_, 11))).toMatchObject({ httpStatus: 422 });
    });

    it('coupons: percent with a cap, minimum subtotal, flat never exceeds subtotal', async () => {
      kit.catalog.createCoupon({ code: 'SAVE20', kind: CouponKind.PERCENT, value: 20, minSubtotalPaise: 500_00, maxDiscountPaise: 150_00 });
      kit.cart.addItem('u1', case_, 1);
      expect(await errorOf(() => kit.cart.applyCoupon('u1', 'SAVE20'))).toMatchObject({ httpStatus: 422 });

      kit.cart.addItem('u1', phone, 1);
      const view = kit.cart.applyCoupon('u1', 'SAVE20');
      expect(view.totals.discountPaise).toBe(150_00); // 20% of 1250 = 250, capped at 150

      kit.cart.removeItem('u1', phone);
      expect(kit.cart.view('u1').couponProblem).toMatch(/at least ₹500/);
    });
  });

  describe('checkout', () => {
    it('requires an Idempotency-Key', async () => {
      expect(await errorOf(() => kit.checkout.checkout('u1', undefined, 'tok_ok'))).toMatchObject({ httpStatus: 400 });
    });

    it('charges, confirms, commits stock, clears the cart; the same key replays without charging', async () => {
      kit.cart.addItem('u1', phone, 2);
      const first = await kit.checkout.checkout('u1', KEY, 'tok_ok');
      expect(first.order.status).toBe(OrderStatus.CONFIRMED);
      expect(kit.products.findByIdOrThrow(phone)).toMatchObject({ available: 0, reserved: 0 });
      expect(kit.cart.view('u1').lines).toEqual([]);

      const again = await kit.checkout.checkout('u1', KEY, 'tok_ok');
      expect(again).toMatchObject({ replayed: true, order: { id: first.order.id } });
      expect(kit.payments.charges).toHaveLength(1);
    });

    it('order lines are a snapshot: a later price change does not touch them', async () => {
      kit.cart.addItem('u1', case_, 1);
      const { order } = await kit.checkout.checkout('u1', KEY, 'tok_ok');
      kit.catalog.updateProduct(case_, { pricePaise: 999_00 });
      expect(kit.checkout.getOrder(order.id).lines[0].unitPricePaise).toBe(250_00);
    });

    it('a declined payment releases stock and the coupon use, and keeps the cart', async () => {
      kit.catalog.createCoupon({ code: 'ONCE', kind: CouponKind.FLAT, value: 100_00, minSubtotalPaise: 0, usageLimit: 1 });
      kit.cart.addItem('u1', phone, 1);
      kit.cart.applyCoupon('u1', 'ONCE');
      const err = await errorOf(() => kit.checkout.checkout('u1', KEY, 'tok_decline'));
      expect(err).toMatchObject({ httpStatus: 422 });

      expect(kit.products.findByIdOrThrow(phone)).toMatchObject({ available: 2, reserved: 0 });
      expect(kit.coupons.findByIdOrThrow('ONCE').usedCount).toBe(0);
      expect(kit.cart.view('u1').lines).toHaveLength(1);
      const order = kit.checkout.listOrders('u1')[0];
      expect(order.status).toBe(OrderStatus.PAYMENT_FAILED);
    });

    it('two buyers, one unit: stock is reserved before the payment await, so only one can pay', async () => {
      kit.catalog.updateProduct(phone, { stockDelta: -1 }); // 1 left
      kit.cart.addItem('a', phone, 1);
      kit.cart.addItem('b', phone, 1);
      kit.payments.hold = true;

      const results = Promise.allSettled([
        kit.checkout.checkout('a', 'key-aaaaaaaa', 'tok_ok'),
        kit.checkout.checkout('b', 'key-bbbbbbbb', 'tok_ok'),
      ]);
      await new Promise((r) => setImmediate(r));
      expect(kit.payments.charges).toHaveLength(1); // b failed fast on stock, never charged
      kit.payments.release();

      const [a, b] = await results;
      expect(a.status).toBe('fulfilled');
      expect(b).toMatchObject({ status: 'rejected', reason: { httpStatus: 409 } });
      expect(kit.products.findByIdOrThrow(phone)).toMatchObject({ available: 0, reserved: 0 });
    });

    it('double-click with two different keys: the per-user lock makes the second see an empty cart', async () => {
      kit.cart.addItem('u1', case_, 1);
      const [a, b] = await Promise.allSettled([
        kit.checkout.checkout('u1', 'key-click001', 'tok_ok'),
        kit.checkout.checkout('u1', 'key-click002', 'tok_ok'),
      ]);
      expect(a.status).toBe('fulfilled');
      expect(b).toMatchObject({ status: 'rejected', reason: { message: 'Cart is empty' } });
      expect(kit.payments.charges).toHaveLength(1);
    });

    it('cancel a confirmed order: refund and restock; cancelling again is 409; others get 403', async () => {
      kit.cart.addItem('u1', phone, 1);
      const { order } = await kit.checkout.checkout('u1', KEY, 'tok_ok');
      expect(await errorOf(() => kit.checkout.cancel(order.id, 'u2'))).toMatchObject({ httpStatus: 403 });

      const cancelled = await kit.checkout.cancel(order.id, 'u1');
      expect(cancelled.status).toBe(OrderStatus.CANCELLED);
      expect(kit.payments.refunds).toEqual([{ paymentId: 'pay_1', amount: order.totals.totalPaise }]);
      expect(kit.products.findByIdOrThrow(phone).available).toBe(2);
      expect(await errorOf(() => kit.checkout.cancel(order.id, 'u1'))).toMatchObject({ httpStatus: 409 });
    });
  });
});
