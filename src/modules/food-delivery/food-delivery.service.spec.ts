import { FoodOrderStatus as S } from './domain/order-status';
import { AgentStatus } from './entities/entities';
import { createFoodKit, INDIRANAGAR, MYSURU, NEAR_KORAMANGALA } from './testing/food-test-kit';

function errorOf(fn: () => unknown) {
  try {
    fn();
  } catch (e) {
    return e as { httpStatus: number; message: string; details?: unknown };
  }
  throw new Error('expected an error');
}

describe('Food delivery', () => {
  let kit: ReturnType<typeof createFoodKit>;
  beforeEach(() => (kit = createFoodKit()));

  describe('placing', () => {
    it('snapshots prices and charges distance-based delivery', () => {
      const o = kit.order('cust_1', 1);
      expect(o).toMatchObject({ status: S.PLACED, itemsTotalPaise: 320_00, distanceKm: 3.1 });
      expect(o.deliveryFeePaise).toBe(25_00 + 2 * 8_00); // first 2 km, then 2 started km
      expect(kit.order('cust_1', 2).deliveryFeePaise).toBe(0); // ₹640 ≥ ₹499: free
    });

    it('422 when closed, an item is unavailable, or the address is too far', () => {
      kit.service.setItemAvailability(kit.restaurant.id, kit.biryani.id, false);
      expect(errorOf(() => kit.order())).toMatchObject({ httpStatus: 422, details: { unavailable: ['Chicken Biryani'] } });
      kit.service.setItemAvailability(kit.restaurant.id, kit.biryani.id, true);

      expect(errorOf(() => kit.service.place({ customerId: 'c', restaurantId: kit.restaurant.id, items: [{ menuItemId: kit.biryani.id, qty: 1 }], deliveryLocation: MYSURU }))).toMatchObject({ httpStatus: 422 });

      kit.service.setOpen(kit.restaurant.id, false);
      expect(errorOf(() => kit.order())).toMatchObject({ httpStatus: 422 });
    });
  });

  describe('lifecycle', () => {
    it('happy path: accept assigns the nearest agent, who picks up and delivers', () => {
      const far = kit.service.createAgent({ name: 'Far', location: INDIRANAGAR });
      const near = kit.service.createAgent({ name: 'Near', location: NEAR_KORAMANGALA });
      const o = kit.order();

      const accepted = kit.service.accept(o.id, kit.restaurant.id);
      expect(accepted.agentId).toBe(near.id);
      expect(kit.service.listAgents().find((a) => a.id === near.id)!.status).toBe(AgentStatus.BUSY);

      kit.service.ready(o.id, kit.restaurant.id);
      kit.service.pickUp(o.id, near.id);
      const done = kit.service.deliver(o.id, near.id);
      expect(done.history.map((h) => h.status)).toEqual([S.PLACED, S.ACCEPTED, S.READY, S.PICKED_UP, S.DELIVERED]);
      expect(kit.service.listAgents().find((a) => a.id === near.id)!.status).toBe(AgentStatus.AVAILABLE);
      expect(far.status).toBe(AgentStatus.AVAILABLE);
    });

    it('the table decides who may do what: 403 wrong actor, 409 wrong state', () => {
      const agent = kit.service.createAgent({ name: 'A', location: NEAR_KORAMANGALA });
      const o = kit.order();
      expect(errorOf(() => kit.service.accept(o.id, 'rst_other'))).toMatchObject({ httpStatus: 403 });
      expect(errorOf(() => kit.service.pickUp(o.id, agent.id))).toMatchObject({ httpStatus: 403 }); // not assigned yet

      kit.service.accept(o.id, kit.restaurant.id);
      expect(errorOf(() => kit.service.pickUp(o.id, agent.id))).toMatchObject({ httpStatus: 409 }); // not READY
      expect(errorOf(() => kit.service.cancel(o.id, { customerId: 'cust_1' }))).toMatchObject({ httpStatus: 403 }); // kitchen started
    });

    it('no free agent: the order waits, and gets the next agent who comes online', () => {
      const o = kit.order();
      expect(kit.service.accept(o.id, kit.restaurant.id).agentId).toBeNull();
      expect(kit.service.waitingQueue()).toEqual([o.id]);

      const agent = kit.service.createAgent({ name: 'Late', location: NEAR_KORAMANGALA });
      expect(kit.service.get(o.id).agentId).toBe(agent.id);
      expect(kit.service.waitingQueue()).toEqual([]);
    });

    it('one agent, two orders: the second waits until the first is delivered', () => {
      const agent = kit.service.createAgent({ name: 'Solo', location: NEAR_KORAMANGALA });
      const a = kit.order('c1');
      const b = kit.order('c2');
      kit.service.accept(a.id, kit.restaurant.id);
      kit.service.accept(b.id, kit.restaurant.id);
      expect([kit.service.get(a.id).agentId, kit.service.get(b.id).agentId]).toEqual([agent.id, null]);

      kit.service.ready(a.id, kit.restaurant.id);
      kit.service.pickUp(a.id, agent.id);
      kit.service.deliver(a.id, agent.id); // agent is now at the customer, 3.1 km away: still in range
      expect(kit.service.get(b.id).agentId).toBe(agent.id);
    });

    it('a busy agent can’t go offline; a cancelled order frees its agent', () => {
      const agent = kit.service.createAgent({ name: 'A', location: NEAR_KORAMANGALA });
      const o = kit.order();
      kit.service.accept(o.id, kit.restaurant.id);
      expect(errorOf(() => kit.service.setAgentStatus(agent.id, AgentStatus.OFFLINE))).toMatchObject({ httpStatus: 409 });
      kit.service.cancel(o.id, { restaurantId: kit.restaurant.id, reason: 'out of rice' });
      expect(kit.service.listAgents()[0].status).toBe(AgentStatus.AVAILABLE);
    });
  });

  it('restaurants near a point: open ones within range, nearest first', () => {
    kit.service.createRestaurant({ name: 'Toit', location: INDIRANAGAR, menu: [{ name: 'Pizza', pricePaise: 500_00 }] });
    const near = kit.service.listRestaurants(NEAR_KORAMANGALA);
    expect(near.map((r) => r.name)).toEqual(['Meghana Foods', 'Toit']);
    expect(kit.service.listRestaurants(MYSURU)).toEqual([]);
  });
});
