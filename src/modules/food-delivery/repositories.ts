import { Injectable } from '@nestjs/common';
import { InMemoryRepository } from '../../common/repository/in-memory.repository';
import { CreateInput } from '../../common/repository/repository.interface';
import { DeliveryAgent, FoodOrder, Restaurant } from './entities/entities';

const push = (m: Map<string, string[]>, k: string, id: string) => m.set(k, [...(m.get(k) ?? []), id]);

@Injectable()
export class RestaurantRepository extends InMemoryRepository<Restaurant> {
  constructor() {
    super('Restaurant', 'rst');
  }
}

@Injectable()
export class AgentRepository extends InMemoryRepository<DeliveryAgent> {
  constructor() {
    super('Delivery agent', 'agt');
  }
}

@Injectable()
export class FoodOrderRepository extends InMemoryRepository<FoodOrder> {
  private readonly byCustomer = new Map<string, string[]>();
  private readonly byRestaurant = new Map<string, string[]>();
  constructor() {
    super('Food order', 'fo');
  }
  override create(data: CreateInput<FoodOrder>): FoodOrder {
    const o = super.create(data);
    push(this.byCustomer, o.customerId, o.id);
    push(this.byRestaurant, o.restaurantId, o.id);
    return o;
  }
  findByCustomer(id: string): FoodOrder[] {
    return (this.byCustomer.get(id) ?? []).map((x) => this.findByIdOrThrow(x));
  }
  findByRestaurant(id: string): FoodOrder[] {
    return (this.byRestaurant.get(id) ?? []).map((x) => this.findByIdOrThrow(x));
  }
}
