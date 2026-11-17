import { Module } from '@nestjs/common';
import { DEFAULT_DELIVERY_OPTIONS, DELIVERY_OPTIONS } from './domain/delivery-options';
import {
  AGENT_ASSIGNMENT_STRATEGY,
  DELIVERY_FEE_STRATEGY,
  DistanceFeeStrategy,
  NearestAgentStrategy,
} from './domain/strategies';
import { FoodDeliveryController } from './food-delivery.controller';
import { FoodDeliveryService } from './food-delivery.service';
import { FoodEventBus } from './food-event-bus';
import { FoodNotifier } from './food-notifier.listener';
import { AgentRepository, FoodOrderRepository, RestaurantRepository } from './repositories';

@Module({
  controllers: [FoodDeliveryController],
  providers: [
    RestaurantRepository,
    AgentRepository,
    FoodOrderRepository,
    { provide: DELIVERY_OPTIONS, useValue: DEFAULT_DELIVERY_OPTIONS },
    { provide: AGENT_ASSIGNMENT_STRATEGY, useValue: new NearestAgentStrategy() },
    { provide: DELIVERY_FEE_STRATEGY, useClass: DistanceFeeStrategy },
    FoodEventBus,
    FoodNotifier,
    FoodDeliveryService,
  ],
})
export class FoodDeliveryModule {}
