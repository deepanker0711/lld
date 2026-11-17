import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CatalogService } from './catalog.service';
import { CreateCouponDto, CreateProductDto, UpdateProductDto } from './dto/catalog.dto';

@ApiTags('Cart & Checkout')
@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Post('products')
  createProduct(@Body() dto: CreateProductDto) {
    return this.catalog.createProduct(dto);
  }

  @Get('products')
  listProducts() {
    return this.catalog.listProducts();
  }

  @Get('products/:id')
  getProduct(@Param('id') id: string) {
    return this.catalog.getProduct(id);
  }

  @Patch('products/:id')
  updateProduct(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.catalog.updateProduct(id, dto);
  }

  @Post('coupons')
  createCoupon(@Body() dto: CreateCouponDto) {
    return this.catalog.createCoupon(dto);
  }

  @Get('coupons')
  listCoupons() {
    return this.catalog.listCoupons();
  }
}
