import { ConflictError } from '../../../common/errors/domain.errors';

export enum OrderStatus {
  PENDING_PAYMENT = 'PENDING_PAYMENT',
  CONFIRMED = 'CONFIRMED',
  PAYMENT_FAILED = 'PAYMENT_FAILED',
  CANCELLED = 'CANCELLED',
}

/**
 *   ──► PENDING_PAYMENT ──┬──► CONFIRMED ──► CANCELLED (refund + restock)
 *                         └──► PAYMENT_FAILED           (stock released, cart kept)
 */
export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  [OrderStatus.PENDING_PAYMENT]: [OrderStatus.CONFIRMED, OrderStatus.PAYMENT_FAILED],
  [OrderStatus.CONFIRMED]: [OrderStatus.CANCELLED],
  [OrderStatus.PAYMENT_FAILED]: [],
  [OrderStatus.CANCELLED]: [],
};

export function assertOrderTransition(from: OrderStatus, to: OrderStatus, orderId: string): void {
  const allowed = ORDER_TRANSITIONS[from];
  if (!allowed.includes(to)) {
    throw new ConflictError(`Order '${orderId}' cannot move from ${from} to ${to}`, { from, to, allowed });
  }
}
