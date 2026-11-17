import { Inject, Injectable } from '@nestjs/common';
import { ConflictError, NotFoundError, UnprocessableError } from '../../common/errors/domain.errors';
import { CHECKOUT_OPTIONS, type CheckoutOptions } from './domain/checkout-options';
import { Cart } from './entities/cart.entity';
import { Coupon } from './entities/coupon.entity';
import { OrderTotals } from './entities/order.entity';
import { Product } from './entities/product.entity';
import { PricingService } from './pricing.service';
import { CartRepository, CouponRepository, ProductRepository } from './repositories';

export interface CartLineView {
  productId: string;
  sku: string;
  name: string;
  unitPricePaise: number;
  qty: number;
  lineTotalPaise: number;
  /** Shown, not blocking: stock can change before checkout, which re-checks. */
  inStock: boolean;
}

export interface CartView {
  userId: string;
  lines: CartLineView[];
  couponCode: string | null;
  /** Set when the applied coupon no longer applies (e.g. subtotal dropped below the minimum). */
  couponProblem: string | null;
  totals: OrderTotals;
}

@Injectable()
export class CartService {
  constructor(
    private readonly carts: CartRepository,
    private readonly products: ProductRepository,
    private readonly coupons: CouponRepository,
    private readonly pricing: PricingService,
    @Inject(CHECKOUT_OPTIONS) private readonly options: CheckoutOptions,
  ) {}

  view(userId: string): CartView {
    const cart = this.carts.getOrCreate(userId);
    const lines = cart.lines.map((l) => {
      const p = this.products.findByIdOrThrow(l.productId);
      return {
        productId: p.id,
        sku: p.sku,
        name: p.name,
        unitPricePaise: p.pricePaise,
        qty: l.qty,
        lineTotalPaise: p.pricePaise * l.qty,
        inStock: p.active && p.available >= l.qty,
      };
    });
    const subtotal = lines.reduce((s, l) => s + l.lineTotalPaise, 0);
    const coupon = cart.couponCode ? this.coupons.findById(cart.couponCode) ?? null : null;
    const couponProblem = coupon ? this.pricing.couponProblem(coupon, subtotal) : null;
    return {
      userId,
      lines,
      couponCode: cart.couponCode,
      couponProblem,
      totals: this.pricing.totals(subtotal, couponProblem ? null : coupon),
    };
  }

  /** Adding an existing product increases its quantity. */
  addItem(userId: string, productId: string, qty: number): CartView {
    const product = this.activeProduct(productId);
    const cart = this.carts.getOrCreate(userId);
    const existing = cart.lines.find((l) => l.productId === productId);
    if (!existing && cart.lines.length >= this.options.maxLines) {
      throw new UnprocessableError(`A cart can have at most ${this.options.maxLines} different products`);
    }
    const newQty = (existing?.qty ?? 0) + qty;
    this.assertQty(product, newQty);
    const lines = existing
      ? cart.lines.map((l) => (l.productId === productId ? { ...l, qty: newQty } : l))
      : [...cart.lines, { productId, qty }];
    this.carts.update(userId, { lines });
    return this.view(userId);
  }

  setQty(userId: string, productId: string, qty: number): CartView {
    const cart = this.carts.getOrCreate(userId);
    if (!cart.lines.some((l) => l.productId === productId)) throw new NotFoundError('Cart line', productId);
    if (qty === 0) return this.removeItem(userId, productId);
    this.assertQty(this.activeProduct(productId), qty);
    this.carts.update(userId, {
      lines: cart.lines.map((l) => (l.productId === productId ? { ...l, qty } : l)),
    });
    return this.view(userId);
  }

  removeItem(userId: string, productId: string): CartView {
    const cart = this.carts.getOrCreate(userId);
    this.carts.update(userId, { lines: cart.lines.filter((l) => l.productId !== productId) });
    return this.view(userId);
  }

  applyCoupon(userId: string, code: string): CartView {
    const coupon: Coupon | undefined = this.coupons.findById(code);
    if (!coupon) throw new NotFoundError('Coupon', code);
    this.pricing.assertCouponUsable(coupon, this.view(userId).totals.subtotalPaise);
    this.carts.update(userId, { couponCode: coupon.id });
    return this.view(userId);
  }

  removeCoupon(userId: string): CartView {
    this.carts.getOrCreate(userId);
    this.carts.update(userId, { couponCode: null });
    return this.view(userId);
  }

  clear(userId: string): void {
    this.carts.getOrCreate(userId);
    this.carts.update(userId, { lines: [], couponCode: null });
  }

  raw(userId: string): Cart {
    return this.carts.getOrCreate(userId);
  }

  private activeProduct(productId: string): Product {
    const product = this.products.findById(productId);
    if (!product || !product.active) throw new NotFoundError('Product', productId);
    return product;
  }

  private assertQty(product: Product, qty: number): void {
    if (qty > this.options.maxQtyPerLine) {
      throw new UnprocessableError(`At most ${this.options.maxQtyPerLine} units of one product per order`);
    }
    if (qty > product.available) {
      throw new ConflictError(`Only ${product.available} of '${product.name}' in stock`, {
        productId: product.id,
        requested: qty,
        available: product.available,
      });
    }
  }
}
