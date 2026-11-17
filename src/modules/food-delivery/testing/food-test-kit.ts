import { FakeClock } from '../../../common/utils/clock';
import { DEFAULT_DELIVERY_OPTIONS } from '../domain/delivery-options';
import { DistanceFeeStrategy, NearestAgentStrategy } from '../domain/strategies';
import { FoodDeliveryService } from '../food-delivery.service';
import { FoodEventBus } from '../food-event-bus';
import { AgentRepository, FoodOrderRepository, RestaurantRepository } from '../repositories';

/** Bengaluru: Koramangala restaurant; customer 3.1 km away in HSR Layout. */
export const KORAMANGALA = { lat: 12.9352, lng: 77.6245 };
export const HSR = { lat: 12.9116, lng: 77.6389 };
export const NEAR_KORAMANGALA = { lat: 12.9365, lng: 77.6260 };
export const INDIRANAGAR = { lat: 12.9719, lng: 77.6412 };
export const MYSURU = { lat: 12.2958, lng: 76.6394 };

export function createFoodKit() {
  const clock = new FakeClock(Date.parse('2026-11-09T07:00:00.000Z'));
  const service = new FoodDeliveryService(
    new RestaurantRepository(),
    new AgentRepository(),
    new FoodOrderRepository(),
    new NearestAgentStrategy(),
    new DistanceFeeStrategy(),
    DEFAULT_DELIVERY_OPTIONS,
    new FoodEventBus(),
    clock,
  );
  const restaurant = service.createRestaurant({
    name: 'Meghana Foods',
    location: KORAMANGALA,
    menu: [
      { name: 'Chicken Biryani', pricePaise: 320_00 },
      { name: 'Paneer Biryani', pricePaise: 280_00 },
    ],
  });
  const [biryani, paneer] = restaurant.menu;
  const order = (customerId = 'cust_1', qty = 1) =>
    service.place({ customerId, restaurantId: restaurant.id, items: [{ menuItemId: biryani.id, qty }], deliveryLocation: HSR });
  return { clock, service, restaurant, biryani, paneer, order };
}
