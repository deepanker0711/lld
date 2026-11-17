import { Injectable } from '@nestjs/common';
import { BadRequestError, ConflictError, UnprocessableError } from '../../common/errors/domain.errors';
import { CreateCouponDto, CreateProductDto, UpdateProductDto } from './dto/catalog.dto';
import { Coupon, CouponKind } from './entities/coupon.entity';
import { Product } from './entities/product.entity';
import { CouponRepository, ProductRepository } from './repositories';

@Injectable()
export class CatalogService {
  constructor(
    private readonly products: ProductRepository,
    private readonly coupons: CouponRepository,
  ) {}

  createProduct(dto: CreateProductDto): Product {
    if (this.products.findBySku(dto.sku)) throw new ConflictError(`SKU '${dto.sku}' already exists`);
    return this.products.create({
      sku: dto.sku,
      name: dto.name,
      pricePaise: dto.pricePaise,
      available: dto.stock,
      reserved: 0,
      active: true,
    });
  }

  listProducts(): Product[] {
    return this.products.findAll((p) => p.active);
  }

  getProduct(id: string): Product {
    return this.products.findByIdOrThrow(id);
  }

  /** Price changes affect carts (priced live) but never existing orders (snapshotted). */
  updateProduct(id: string, dto: UpdateProductDto): Product {
    const product = this.products.findByIdOrThrow(id);
    const available = product.available + (dto.stockDelta ?? 0);
    if (available < 0) {
      throw new UnprocessableError('Stock cannot go below zero', { available: product.available });
    }
    return this.products.update(id, { pricePaise: dto.pricePaise ?? product.pricePaise, available });
  }

  createCoupon(dto: CreateCouponDto): Coupon {
    if (dto.kind === CouponKind.PERCENT && dto.value > 100) {
      throw new BadRequestError('A PERCENT coupon value must be 1–100');
    }
    if (this.coupons.exists(dto.code)) throw new ConflictError(`Coupon '${dto.code}' already exists`);
    return this.coupons.create({
      id: dto.code,
      kind: dto.kind,
      value: dto.value,
      minSubtotalPaise: dto.minSubtotalPaise,
      maxDiscountPaise: dto.maxDiscountPaise ?? null,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      usageLimit: dto.usageLimit ?? null,
      usedCount: 0,
    });
  }

  listCoupons(): Coupon[] {
    return this.coupons.findAll();
  }
}
