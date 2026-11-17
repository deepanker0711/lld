import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { FoodEventBus } from './food-event-bus';

/** Observer: would push to the customer app / restaurant tablet / agent app. Logs here. */
@Injectable()
export class FoodNotifier implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FoodNotifier.name);
  private readonly unsubscribe: (() => void)[] = [];

  constructor(private readonly bus: FoodEventBus) {}

  onModuleInit(): void {
    this.unsubscribe.push(
      this.bus.subscribe('order.status_changed', (e) =>
        this.logger.log(`→ customer ${e.customerId}: order ${e.orderId} is ${e.status}`),
      ),
      this.bus.subscribe('agent.assigned', (e) => this.logger.log(`→ agent ${e.agentId}: new pickup for order ${e.orderId}`)),
    );
  }

  onModuleDestroy(): void {
    this.unsubscribe.forEach((u) => u());
  }
}
