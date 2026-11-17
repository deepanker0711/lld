import { Transform } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString, Max, Min } from 'class-validator';

export class AddItemDto {
  @IsString()
  @IsNotEmpty()
  productId: string;

  @IsInt()
  @Min(1)
  @Max(100)
  qty: number;
}

export class SetQtyDto {
  /** 0 removes the line. */
  @IsInt()
  @Min(0)
  @Max(100)
  qty: number;
}

export class ApplyCouponDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsString()
  @IsNotEmpty()
  code: string;
}

export class CheckoutDto {
  /** From the payment SDK on the client. "tok_decline" simulates a declined card. */
  @IsString()
  @IsNotEmpty()
  paymentToken: string;
}
