import { Injectable } from '@nestjs/common';
import { InMemoryRepository } from '../../common/repository/in-memory.repository';
import { CreateInput } from '../../common/repository/repository.interface';
import { Cart } from './entities/cart.entity';
import { Coupon } from './entities/coupon.entity';
import { Order } from './entities/order.entity';
import { Product } from './entities/product.entity';

@Injectable()
export class ProductRepository extends InMemoryRepository<Product> {
  private readonly bySku = new Map<string, string>();

  constructor() {
    super('Product', 'prd');
  }

  override create(data: CreateInput<Product>): Product {
    const product = super.create(data);
    this.bySku.set(product.sku, product.id);
    return product;
  }

  findBySku(sku: string): Product | undefined {
    const id = this.bySku.get(sku);
    return id ? this.findById(id) : undefined;
  }
}

@Injectable()
export class CouponRepository extends InMemoryRepository<Coupon> {
  constructor() {
    super('Coupon');
  }
}

@Injectable()
export class CartRepository extends InMemoryRepository<Cart> {
  constructor() {
    super('Cart');
  }

  /** Created empty on first access. */
  getOrCreate(userId: string): Cart {
    return this.findById(userId) ?? this.create({ id: userId, lines: [], couponCode: null });
  }
}

@Injectable()
export class OrderRepository extends InMemoryRepository<Order> {
  private readonly byUser = new Map<string, string[]>();
  /** `${userId}:${idempotencyKey}` → orderId */
  private readonly byIdempotencyKey = new Map<string, string>();

  constructor() {
    super('Order', 'ord');
  }

  override create(data: CreateInput<Order>): Order {
    const order = super.create(data);
    this.byUser.set(order.userId, [...(this.byUser.get(order.userId) ?? []), order.id]);
    this.byIdempotencyKey.set(`${order.userId}:${order.idempotencyKey}`, order.id);
    return order;
  }

  findByIdempotencyKey(userId: string, key: string): Order | undefined {
    const id = this.byIdempotencyKey.get(`${userId}:${key}`);
    return id ? this.findById(id) : undefined;
  }

  findByUser(userId: string): Order[] {
    return (this.byUser.get(userId) ?? []).map((id) => this.findByIdOrThrow(id));
  }
}
