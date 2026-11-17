import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnprocessableError,
} from '../../common/errors/domain.errors';
import { Clock } from '../../common/utils/clock';
import { KeyedMutex } from '../../common/utils/keyed-mutex';
import { CartService } from './cart.service';
import { assertOrderTransition, OrderStatus } from './domain/order-status';
import { PAYMENT_GATEWAY, PaymentDeclinedError, type PaymentGateway } from './domain/payment-gateway';
import { Order, OrderLine } from './entities/order.entity';
import { PricingService } from './pricing.service';
import { CouponRepository, OrderRepository, ProductRepository } from './repositories';

export interface CheckoutResult {
  order: Order;
  /** true when this call returned an order created by an earlier call with the same key. */
  replayed: boolean;
}

@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);

  constructor(
    private readonly carts: CartService,
    private readonly products: ProductRepository,
    private readonly coupons: CouponRepository,
    private readonly orders: OrderRepository,
    private readonly pricing: PricingService,
    @Inject(PAYMENT_GATEWAY) private readonly payments: PaymentGateway,
    private readonly clock: Clock,
    private readonly mutex: KeyedMutex,
  ) {}

  /**
   * 1. Idempotency: same user + same key → the same order, never a second charge.
   * 2. Under a per-user lock (the payment is awaited, so a double-click would otherwise
   *    run two checkouts of the same cart).
   * 3. Validate everything, then RESERVE stock synchronously before the await, so two
   *    different users can't both pay for the last unit.
   * 4. Payment: success → commit stock, clear cart. Decline → release stock, keep cart.
   */
  checkout(userId: string, idempotencyKey: string | undefined, paymentToken: string): Promise<CheckoutResult> {
    if (!idempotencyKey || !/^[A-Za-z0-9_-]{8,64}$/.test(idempotencyKey)) {
      throw new BadRequestError('Idempotency-Key header is required (8-64 letters, digits, _ or -)');
    }
    return this.mutex.runExclusive(`checkout:${userId}`, async () => {
      const previous = this.orders.findByIdempotencyKey(userId, idempotencyKey);
      if (previous) return { order: previous, replayed: true };

      const order = this.placeOrder(userId, idempotencyKey);
      try {
        const { paymentId } = await this.payments.charge(order.id, order.totals.totalPaise, paymentToken);
        return { order: this.confirm(order, paymentId), replayed: false };
      } catch (err) {
        this.fail(order, err instanceof PaymentDeclinedError ? err.message : 'Payment error');
        if (err instanceof PaymentDeclinedError) {
          throw new UnprocessableError(`Payment declined: ${err.message}`, { orderId: order.id });
        }
        throw err;
      }
    });
  }

  /** Synchronous: validation and reservation can't interleave with another checkout. */
  private placeOrder(userId: string, idempotencyKey: string): Order {
    const cart = this.carts.raw(userId);
    if (cart.lines.length === 0) throw new UnprocessableError('Cart is empty');

    const shortages: { productId: string; requested: number; available: number }[] = [];
    const lines: OrderLine[] = cart.lines.map((l) => {
      const p = this.products.findById(l.productId);
      if (!p || !p.active) throw new UnprocessableError(`Product '${l.productId}' is no longer sold`);
      if (p.available < l.qty) shortages.push({ productId: p.id, requested: l.qty, available: p.available });
      return {
        productId: p.id,
        sku: p.sku,
        name: p.name,
        unitPricePaise: p.pricePaise,
        qty: l.qty,
        lineTotalPaise: p.pricePaise * l.qty,
      };
    });
    if (shortages.length) throw new ConflictError('Some items are out of stock', { shortages });

    const subtotal = lines.reduce((s, l) => s + l.lineTotalPaise, 0);
    const coupon = cart.couponCode ? this.coupons.findById(cart.couponCode) ?? null : null;
    if (coupon) this.pricing.assertCouponUsable(coupon, subtotal);

    // Reserve: from here until the payment settles, these units can't be sold twice.
    for (const l of lines) {
      const p = this.products.findByIdOrThrow(l.productId);
      this.products.update(p.id, { available: p.available - l.qty, reserved: p.reserved + l.qty });
    }
    if (coupon) this.coupons.update(coupon.id, { usedCount: coupon.usedCount + 1 });

    return this.orders.create({
      userId,
      idempotencyKey,
      lines,
      couponCode: coupon?.id ?? null,
      totals: this.pricing.totals(subtotal, coupon),
      status: OrderStatus.PENDING_PAYMENT,
      paymentId: null,
      failureReason: null,
      history: [{ status: OrderStatus.PENDING_PAYMENT, at: this.clock.date() }],
    });
  }

  private confirm(order: Order, paymentId: string): Order {
    for (const l of order.lines) {
      const p = this.products.findByIdOrThrow(l.productId);
      this.products.update(p.id, { reserved: p.reserved - l.qty }); // sold: leaves the building
    }
    this.carts.clear(order.userId);
    return this.move(order, OrderStatus.CONFIRMED, { paymentId });
  }

  private fail(order: Order, reason: string): void {
    this.releaseStock(order);
    if (order.couponCode) {
      const c = this.coupons.findByIdOrThrow(order.couponCode);
      this.coupons.update(c.id, { usedCount: c.usedCount - 1 });
    }
    this.move(order, OrderStatus.PAYMENT_FAILED, { failureReason: reason });
    this.logger.warn(`order ${order.id} payment failed: ${reason}`);
  }

  // ── Orders ───────────────────────────────────────────────────────────

  getOrder(id: string, userId?: string): Order {
    const order = this.orders.findById(id);
    // Another user's order is "not found": don't confirm it exists.
    if (!order || (userId && order.userId !== userId)) throw new NotFoundError('Order', id);
    return order;
  }

  listOrders(userId: string): Order[] {
    return this.orders.findByUser(userId).reverse();
  }

  /** CONFIRMED → CANCELLED: refund, then put the units back on sale. */
  cancel(orderId: string, userId: string): Promise<Order> {
    return this.mutex.runExclusive(`order:${orderId}`, async () => {
      const order = this.orders.findById(orderId);
      if (!order) throw new NotFoundError('Order', orderId);
      if (order.userId !== userId) throw new ForbiddenError('You can only cancel your own orders');
      assertOrderTransition(order.status, OrderStatus.CANCELLED, order.id);

      await this.payments.refund(order.paymentId!, order.totals.totalPaise);
      for (const l of order.lines) {
        const p = this.products.findByIdOrThrow(l.productId);
        this.products.update(p.id, { available: p.available + l.qty });
      }
      return this.move(order, OrderStatus.CANCELLED, {}, 'refunded');
    });
  }

  private releaseStock(order: Order): void {
    for (const l of order.lines) {
      const p = this.products.findByIdOrThrow(l.productId);
      this.products.update(p.id, { available: p.available + l.qty, reserved: p.reserved - l.qty });
    }
  }

  private move(order: Order, to: OrderStatus, patch: Partial<Order>, note?: string): Order {
    assertOrderTransition(order.status, to, order.id);
    return this.orders.update(order.id, {
      ...patch,
      status: to,
      history: [...order.history, { status: to, at: this.clock.date(), ...(note && { note }) }],
    });
  }
}
