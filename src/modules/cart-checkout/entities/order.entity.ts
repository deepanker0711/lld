import { BaseEntity } from '../../../common/entities/base.entity';
import { OrderStatus } from '../domain/order-status';

/** Snapshot at checkout: later price or name changes don't rewrite past orders. */
export interface OrderLine {
  productId: string;
  sku: string;
  name: string;
  unitPricePaise: number;
  qty: number;
  lineTotalPaise: number;
}

export interface OrderTotals {
  subtotalPaise: number;
  discountPaise: number;
  taxPaise: number;
  totalPaise: number;
}

export class Order extends BaseEntity {
  userId: string;
  /** Unique per user; a retried checkout with the same key returns this order. */
  idempotencyKey: string;
  lines: OrderLine[];
  couponCode: string | null;
  totals: OrderTotals;
  status: OrderStatus;
  paymentId: string | null;
  failureReason: string | null;
  history: { status: OrderStatus; at: Date; note?: string }[];
}
