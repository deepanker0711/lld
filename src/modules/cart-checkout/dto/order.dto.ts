import { IsNotEmpty, IsString } from 'class-validator';

export class OrdersQuery {
  @IsString()
  @IsNotEmpty()
  userId: string;
}

export class CancelOrderDto {
  /** From the auth token in a real app. */
  @IsString()
  @IsNotEmpty()
  userId: string;
}
