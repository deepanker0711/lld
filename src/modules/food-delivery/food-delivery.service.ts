import { Inject, Injectable } from '@nestjs/common';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnprocessableError,
} from '../../common/errors/domain.errors';
import { Clock } from '../../common/utils/clock';
import { generateId } from '../../common/utils/id.generator';
import { DELIVERY_OPTIONS, type DeliveryOptions } from './domain/delivery-options';
import { distanceKm, GeoPoint } from './domain/geo';
import { Actor, assertFoodTransition, FoodOrderStatus } from './domain/order-status';
import {
  AGENT_ASSIGNMENT_STRATEGY,
  type AgentAssignmentStrategy,
  DELIVERY_FEE_STRATEGY,
  type DeliveryFeeStrategy,
} from './domain/strategies';
import { CreateAgentDto, CreateRestaurantDto, PlaceFoodOrderDto } from './dto/dto';
import { AgentStatus, DeliveryAgent, FoodOrder, FoodOrderLine, Restaurant } from './entities/entities';
import { FoodEventBus } from './food-event-bus';
import { AgentRepository, FoodOrderRepository, RestaurantRepository } from './repositories';

/**
 * Every method is synchronous, so assigning an agent (find free → mark BUSY) can't
 * hand the same agent two orders. Across servers: a conditional
 * UPDATE agents SET status='BUSY' WHERE id=$1 AND status='AVAILABLE'.
 */
@Injectable()
export class FoodDeliveryService {
  /** Accepted orders waiting for a free agent, oldest first. */
  private readonly waitingForAgent: string[] = [];

  constructor(
    private readonly restaurants: RestaurantRepository,
    private readonly agents: AgentRepository,
    private readonly orders: FoodOrderRepository,
    @Inject(AGENT_ASSIGNMENT_STRATEGY) private readonly assignment: AgentAssignmentStrategy,
    @Inject(DELIVERY_FEE_STRATEGY) private readonly fees: DeliveryFeeStrategy,
    @Inject(DELIVERY_OPTIONS) private readonly options: DeliveryOptions,
    private readonly bus: FoodEventBus,
    private readonly clock: Clock,
  ) {}

  // ── Restaurants ──────────────────────────────────────────────────────

  createRestaurant(dto: CreateRestaurantDto): Restaurant {
    return this.restaurants.create({
      name: dto.name,
      location: { ...dto.location },
      isOpen: true,
      menu: dto.menu.map((m) => ({ id: generateId('itm'), name: m.name, pricePaise: m.pricePaise, available: true })),
    });
  }

  /** With a location: open restaurants that deliver there, nearest first. */
  listRestaurants(at?: GeoPoint): (Restaurant & { distanceKm?: number })[] {
    if (!at) return this.restaurants.findAll();
    return this.restaurants
      .findAll((r) => r.isOpen)
      .map((r) => ({ ...r, distanceKm: round1(distanceKm(at, r.location)) }))
      .filter((r) => r.distanceKm <= this.options.maxDeliveryKm)
      .sort((a, b) => a.distanceKm - b.distanceKm);
  }

  getRestaurant(id: string): Restaurant {
    return this.restaurants.findByIdOrThrow(id);
  }

  setOpen(id: string, isOpen: boolean): Restaurant {
    this.restaurants.findByIdOrThrow(id);
    return this.restaurants.update(id, { isOpen });
  }

  setItemAvailability(id: string, itemId: string, available: boolean): Restaurant {
    const r = this.restaurants.findByIdOrThrow(id);
    if (!r.menu.some((m) => m.id === itemId)) throw new NotFoundError('Menu item', itemId);
    return this.restaurants.update(id, { menu: r.menu.map((m) => (m.id === itemId ? { ...m, available } : m)) });
  }

  restaurantOrders(id: string, status?: FoodOrderStatus): FoodOrder[] {
    this.restaurants.findByIdOrThrow(id);
    return this.orders.findByRestaurant(id).filter((o) => !status || o.status === status);
  }

  // ── Agents ───────────────────────────────────────────────────────────

  createAgent(dto: CreateAgentDto): DeliveryAgent {
    const agent = this.agents.create({
      name: dto.name,
      location: { ...dto.location },
      status: AgentStatus.AVAILABLE,
      currentOrderId: null,
      availableSince: this.clock.date(),
    });
    this.dispatchWaiting();
    return this.agents.findByIdOrThrow(agent.id);
  }

  listAgents(): DeliveryAgent[] {
    return this.agents.findAll();
  }

  setAgentStatus(id: string, status: AgentStatus.AVAILABLE | AgentStatus.OFFLINE): DeliveryAgent {
    const agent = this.agents.findByIdOrThrow(id);
    if (agent.status === AgentStatus.BUSY) {
      throw new ConflictError('Finish the current delivery first', { currentOrderId: agent.currentOrderId });
    }
    if (agent.status === status) return agent;
    this.agents.update(id, { status, availableSince: this.clock.date() });
    if (status === AgentStatus.AVAILABLE) this.dispatchWaiting();
    return this.agents.findByIdOrThrow(id);
  }

  updateAgentLocation(id: string, at: GeoPoint): DeliveryAgent {
    this.agents.findByIdOrThrow(id);
    return this.agents.update(id, { location: { ...at } });
  }

  // ── Orders ───────────────────────────────────────────────────────────

  place(dto: PlaceFoodOrderDto): FoodOrder {
    const r = this.restaurants.findByIdOrThrow(dto.restaurantId);
    if (!r.isOpen) throw new UnprocessableError(`${r.name} is closed right now`);

    const ids = dto.items.map((i) => i.menuItemId);
    if (new Set(ids).size !== ids.length) throw new BadRequestError('Each menu item may appear once; use qty');
    const qty = dto.items.reduce((s, i) => s + i.qty, 0);
    if (qty > this.options.maxItemsPerOrder) throw new UnprocessableError(`At most ${this.options.maxItemsPerOrder} items per order`);

    const byId = new Map(r.menu.map((m) => [m.id, m]));
    const unknown = ids.filter((id) => !byId.has(id));
    if (unknown.length) throw new BadRequestError(`Not on this menu: ${unknown.join(', ')}`);
    const unavailable = ids.filter((id) => !byId.get(id)!.available);
    if (unavailable.length) {
      throw new UnprocessableError('Some items are unavailable', { unavailable: unavailable.map((id) => byId.get(id)!.name) });
    }

    const km = round1(distanceKm(r.location, dto.deliveryLocation));
    if (km > this.options.maxDeliveryKm) {
      throw new UnprocessableError(`${r.name} doesn't deliver that far (${km} km > ${this.options.maxDeliveryKm} km)`);
    }

    // Prices copied into the order: menu changes later don't change what was paid.
    const lines: FoodOrderLine[] = dto.items.map((i) => {
      const m = byId.get(i.menuItemId)!;
      return { menuItemId: m.id, name: m.name, unitPricePaise: m.pricePaise, qty: i.qty };
    });
    const itemsTotalPaise = lines.reduce((s, l) => s + l.unitPricePaise * l.qty, 0);
    const deliveryFeePaise = this.fees.fee(km, itemsTotalPaise);

    const order = this.orders.create({
      customerId: dto.customerId,
      restaurantId: r.id,
      lines,
      deliveryLocation: { ...dto.deliveryLocation },
      distanceKm: km,
      itemsTotalPaise,
      deliveryFeePaise,
      totalPaise: itemsTotalPaise + deliveryFeePaise,
      status: FoodOrderStatus.PLACED,
      agentId: null,
      history: [{ status: FoodOrderStatus.PLACED, at: this.clock.date(), by: dto.customerId }],
    });
    this.publish(order);
    return order;
  }

  get(id: string): FoodOrder {
    return this.orders.findByIdOrThrow(id);
  }

  listForCustomer(customerId: string, status?: FoodOrderStatus): FoodOrder[] {
    return this.orders.findByCustomer(customerId).filter((o) => !status || o.status === status).reverse();
  }

  // Each action names the actor; the transition table decides if that actor may do it.
  accept(id: string, restaurantId: string) {
    return this.move(id, FoodOrderStatus.ACCEPTED, Actor.RESTAURANT, restaurantId);
  }
  reject(id: string, restaurantId: string, reason?: string) {
    return this.move(id, FoodOrderStatus.REJECTED, Actor.RESTAURANT, restaurantId, reason);
  }
  ready(id: string, restaurantId: string) {
    return this.move(id, FoodOrderStatus.READY, Actor.RESTAURANT, restaurantId);
  }
  pickUp(id: string, agentId: string) {
    return this.move(id, FoodOrderStatus.PICKED_UP, Actor.AGENT, agentId);
  }
  deliver(id: string, agentId: string) {
    return this.move(id, FoodOrderStatus.DELIVERED, Actor.AGENT, agentId);
  }

  cancel(id: string, by: { customerId?: string; restaurantId?: string; reason?: string }): FoodOrder {
    if (!!by.customerId === !!by.restaurantId) {
      throw new BadRequestError('Send exactly one of customerId or restaurantId');
    }
    return by.customerId
      ? this.move(id, FoodOrderStatus.CANCELLED, Actor.CUSTOMER, by.customerId, by.reason)
      : this.move(id, FoodOrderStatus.CANCELLED, Actor.RESTAURANT, by.restaurantId!, by.reason);
  }

  private move(id: string, to: FoodOrderStatus, actor: Actor, actorId: string, note?: string): FoodOrder {
    const order = this.orders.findByIdOrThrow(id);
    // Authorization before state: is this actor part of this order at all?
    const party = { [Actor.CUSTOMER]: order.customerId, [Actor.RESTAURANT]: order.restaurantId, [Actor.AGENT]: order.agentId };
    if (party[actor] !== actorId) throw new ForbiddenError(`This order is not assigned to ${actor.toLowerCase()} '${actorId}'`);
    assertFoodTransition(order.status, to, actor, order.id);

    let updated = this.orders.update(id, {
      status: to,
      history: [...order.history, { status: to, at: this.clock.date(), by: actorId, ...(note && { note }) }],
    });

    if (to === FoodOrderStatus.ACCEPTED) updated = this.tryAssign(updated);
    if (to === FoodOrderStatus.DELIVERED || to === FoodOrderStatus.CANCELLED || to === FoodOrderStatus.REJECTED) {
      this.releaseAgent(updated, to === FoodOrderStatus.DELIVERED ? updated.deliveryLocation : undefined);
      this.dropFromQueue(id);
    }
    this.publish(updated);
    return this.orders.findByIdOrThrow(id);
  }

  // ── Dispatch ─────────────────────────────────────────────────────────

  /** Assign now if someone is free; otherwise queue. The kitchen cooks meanwhile. */
  private tryAssign(order: FoodOrder): FoodOrder {
    const restaurant = this.restaurants.findByIdOrThrow(order.restaurantId);
    const free = this.agents.findAll((a) => a.status === AgentStatus.AVAILABLE);
    const agent = this.assignment.choose(restaurant.location, free);
    if (!agent) {
      if (!this.waitingForAgent.includes(order.id)) this.waitingForAgent.push(order.id);
      return order;
    }
    this.agents.update(agent.id, { status: AgentStatus.BUSY, currentOrderId: order.id });
    this.bus.publish('agent.assigned', { orderId: order.id, agentId: agent.id });
    return this.orders.update(order.id, { agentId: agent.id });
  }

  /** Called whenever an agent frees up: oldest waiting order first. */
  private dispatchWaiting(): void {
    for (const orderId of [...this.waitingForAgent]) {
      const order = this.orders.findByIdOrThrow(orderId);
      const stillNeeds = order.agentId === null && [FoodOrderStatus.ACCEPTED, FoodOrderStatus.READY].includes(order.status);
      if (!stillNeeds) {
        this.dropFromQueue(orderId);
        continue;
      }
      // No free agent within range of THIS restaurant: skip it, a later order may be closer to someone.
      if (this.tryAssign(order).agentId === null) continue;
      this.dropFromQueue(orderId);
    }
  }

  private releaseAgent(order: FoodOrder, at?: GeoPoint): void {
    if (!order.agentId) return;
    this.agents.update(order.agentId, {
      status: AgentStatus.AVAILABLE,
      currentOrderId: null,
      availableSince: this.clock.date(),
      ...(at && { location: { ...at } }),
    });
    this.dispatchWaiting();
  }

  private dropFromQueue(orderId: string): void {
    const i = this.waitingForAgent.indexOf(orderId);
    if (i >= 0) this.waitingForAgent.splice(i, 1);
  }

  waitingQueue(): string[] {
    return [...this.waitingForAgent];
  }

  private publish(o: FoodOrder): void {
    this.bus.publish('order.status_changed', {
      orderId: o.id,
      customerId: o.customerId,
      restaurantId: o.restaurantId,
      agentId: o.agentId,
      status: o.status,
    });
  }
}

const round1 = (x: number) => Math.round(x * 10) / 10;
