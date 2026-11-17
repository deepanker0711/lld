import { ConflictError, ForbiddenError } from '../../../common/errors/domain.errors';

export enum FoodOrderStatus {
  PLACED = 'PLACED',
  ACCEPTED = 'ACCEPTED',
  READY = 'READY',
  PICKED_UP = 'PICKED_UP',
  DELIVERED = 'DELIVERED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
}

export enum Actor {
  CUSTOMER = 'CUSTOMER',
  RESTAURANT = 'RESTAURANT',
  AGENT = 'AGENT',
}

/**
 *   PLACED ──► ACCEPTED ──► READY ──► PICKED_UP ──► DELIVERED
 *     │  └──► REJECTED (restaurant)
 *     └──► CANCELLED (customer, before the kitchen starts)
 *   ACCEPTED ──► CANCELLED (restaurant only: e.g. ran out of an item)
 *
 * Each move lists who may make it: the table is both the state machine and the permissions.
 */
export const FOOD_TRANSITIONS: Record<FoodOrderStatus, Partial<Record<FoodOrderStatus, Actor[]>>> = {
  [FoodOrderStatus.PLACED]: {
    [FoodOrderStatus.ACCEPTED]: [Actor.RESTAURANT],
    [FoodOrderStatus.REJECTED]: [Actor.RESTAURANT],
    [FoodOrderStatus.CANCELLED]: [Actor.CUSTOMER],
  },
  [FoodOrderStatus.ACCEPTED]: {
    [FoodOrderStatus.READY]: [Actor.RESTAURANT],
    [FoodOrderStatus.CANCELLED]: [Actor.RESTAURANT],
  },
  [FoodOrderStatus.READY]: { [FoodOrderStatus.PICKED_UP]: [Actor.AGENT] },
  [FoodOrderStatus.PICKED_UP]: { [FoodOrderStatus.DELIVERED]: [Actor.AGENT] },
  [FoodOrderStatus.DELIVERED]: {},
  [FoodOrderStatus.REJECTED]: {},
  [FoodOrderStatus.CANCELLED]: {},
};

/** 409 when the move doesn't exist; 403 when it exists but not for this actor. */
export function assertFoodTransition(from: FoodOrderStatus, to: FoodOrderStatus, actor: Actor, orderId: string): void {
  const moves = FOOD_TRANSITIONS[from];
  const actors = moves[to];
  if (!actors) {
    throw new ConflictError(`Order '${orderId}' cannot move from ${from} to ${to}`, {
      from,
      to,
      allowed: Object.keys(moves),
    });
  }
  if (!actors.includes(actor)) {
    throw new ForbiddenError(`${actor} cannot move an order from ${from} to ${to}`, { allowedActors: actors });
  }
}
