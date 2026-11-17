import { BaseEntity } from '../../../common/entities/base.entity';

export interface CartLine {
  productId: string;
  qty: number;
}

/** id = userId: one cart per user, lookup by user is a Map get. Prices are NOT stored. */
export class Cart extends BaseEntity {
  lines: CartLine[];
  couponCode: string | null;
}
