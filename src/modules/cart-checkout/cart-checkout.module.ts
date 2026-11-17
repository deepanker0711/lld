import { Module } from '@nestjs/common';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { CheckoutService } from './checkout.service';
import { CHECKOUT_OPTIONS, DEFAULT_CHECKOUT_OPTIONS } from './domain/checkout-options';
import { DISCOUNT_STRATEGIES, DISCOUNT_STRATEGY_CLASSES, type DiscountStrategy } from './domain/discount.strategy';
import { PAYMENT_GATEWAY } from './domain/payment-gateway';
import { FakePaymentGateway } from './payments/fake-payment-gateway';
import { PricingService } from './pricing.service';
import { CartRepository, CouponRepository, OrderRepository, ProductRepository } from './repositories';

@Module({
  controllers: [CatalogController, CartController],
  providers: [
    ProductRepository,
    CouponRepository,
    CartRepository,
    OrderRepository,
    { provide: CHECKOUT_OPTIONS, useValue: DEFAULT_CHECKOUT_OPTIONS },
    ...DISCOUNT_STRATEGY_CLASSES,
    {
      provide: DISCOUNT_STRATEGIES,
      useFactory: (...s: DiscountStrategy[]) => s,
      inject: DISCOUNT_STRATEGY_CLASSES,
    },
    { provide: PAYMENT_GATEWAY, useClass: FakePaymentGateway },
    PricingService,
    CatalogService,
    CartService,
    CheckoutService,
  ],
})
export class CartCheckoutModule {}
