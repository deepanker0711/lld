import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CouponKind } from '../entities/coupon.entity';

const upper = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value);

export class CreateProductDto {
  @Transform(upper)
  @Matches(/^[A-Z0-9-]{2,30}$/, { message: 'sku must be 2-30 letters, digits or dashes' })
  sku: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  /** Integer paise: ₹499 = 49900. */
  @IsInt()
  @Min(1)
  @Max(10_000_000_00)
  pricePaise: number;

  @IsInt()
  @Min(0)
  @Max(1_000_000)
  stock: number;
}

export class UpdateProductDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10_000_000_00)
  pricePaise?: number;

  /** Units to add (or remove, if negative) to available stock. */
  @IsOptional()
  @IsInt()
  @Min(-1_000_000)
  @Max(1_000_000)
  stockDelta?: number;
}

export class CreateCouponDto {
  @Transform(upper)
  @Matches(/^[A-Z0-9]{3,20}$/, { message: 'code must be 3-20 letters or digits' })
  code: string;

  @IsEnum(CouponKind)
  kind: CouponKind;

  /** Percent (1–100) for PERCENT, paise for FLAT. */
  @IsInt()
  @Min(1)
  value: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  minSubtotalPaise: number = 0;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxDiscountPaise?: number;

  @IsOptional()
  @IsISO8601()
  expiresAt?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  usageLimit?: number;
}
