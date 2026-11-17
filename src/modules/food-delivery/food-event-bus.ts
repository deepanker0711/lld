import { Injectable } from '@nestjs/common';
import { TypedEventBus } from '../../common/events/typed-event-bus';
import { FoodOrderStatus } from './domain/order-status';

export interface FoodEvents {
  'order.status_changed': { orderId: string; customerId: string; restaurantId: string; agentId: string | null; status: FoodOrderStatus };
  'agent.assigned': { orderId: string; agentId: string };
}

@Injectable()
export class FoodEventBus extends TypedEventBus<FoodEvents> {}
