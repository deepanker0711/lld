import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Patch, Post, Put, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CartService } from './cart.service';
import { CheckoutService } from './checkout.service';
import { AddItemDto, ApplyCouponDto, CheckoutDto, SetQtyDto } from './dto/cart.dto';
import { CancelOrderDto, OrdersQuery } from './dto/order.dto';

/** userId in the path is a demo stand-in for the authenticated user (see the auth module). */
@ApiTags('Cart & Checkout')
@Controller()
export class CartController {
  constructor(
    private readonly carts: CartService,
    private readonly checkouts: CheckoutService,
  ) {}

  @Get('carts/:userId')
  view(@Param('userId') userId: string) {
    return this.carts.view(userId);
  }

  @Post('carts/:userId/items')
  @HttpCode(200)
  add(@Param('userId') userId: string, @Body() dto: AddItemDto) {
    return this.carts.addItem(userId, dto.productId, dto.qty);
  }

  @Patch('carts/:userId/items/:productId')
  setQty(@Param('userId') userId: string, @Param('productId') productId: string, @Body() dto: SetQtyDto) {
    return this.carts.setQty(userId, productId, dto.qty);
  }

  @Delete('carts/:userId/items/:productId')
  remove(@Param('userId') userId: string, @Param('productId') productId: string) {
    return this.carts.removeItem(userId, productId);
  }

  @Put('carts/:userId/coupon')
  applyCoupon(@Param('userId') userId: string, @Body() dto: ApplyCouponDto) {
    return this.carts.applyCoupon(userId, dto.code);
  }

  @Delete('carts/:userId/coupon')
  removeCoupon(@Param('userId') userId: string) {
    return this.carts.removeCoupon(userId);
  }

  /** 201 for a new order; 200 + Idempotent-Replayed: true when the key was seen before. */
  @Post('carts/:userId/checkout')
  async checkout(
    @Param('userId') userId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: CheckoutDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { order, replayed } = await this.checkouts.checkout(userId, key, dto.paymentToken);
    if (replayed) {
      res.status(200);
      res.setHeader('Idempotent-Replayed', 'true');
    }
    return order;
  }

  @Get('orders')
  orders(@Query() q: OrdersQuery) {
    return this.checkouts.listOrders(q.userId);
  }

  @Get('orders/:id')
  order(@Param('id') id: string) {
    return this.checkouts.getOrder(id);
  }

  @Post('orders/:id/cancel')
  @HttpCode(200)
  cancel(@Param('id') id: string, @Body() dto: CancelOrderDto) {
    return this.checkouts.cancel(id, dto.userId);
  }
}
