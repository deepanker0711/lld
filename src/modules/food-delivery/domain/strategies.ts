import { DeliveryAgent } from '../entities/entities';
import { distanceKm, GeoPoint } from './geo';

/** Strategy: which free agent gets an order. */
export interface AgentAssignmentStrategy {
  choose(pickup: GeoPoint, available: DeliveryAgent[]): DeliveryAgent | undefined;
}
export const AGENT_ASSIGNMENT_STRATEGY = Symbol('AGENT_ASSIGNMENT_STRATEGY');

/** Nearest to the restaurant; ties → the one who has waited longest since their last trip. */
export class NearestAgentStrategy implements AgentAssignmentStrategy {
  constructor(private readonly maxPickupKm = 5) {}

  choose(pickup: GeoPoint, available: DeliveryAgent[]): DeliveryAgent | undefined {
    return available
      .map((a) => ({ a, km: distanceKm(pickup, a.location) }))
      .filter((x) => x.km <= this.maxPickupKm)
      .sort((x, y) => x.km - y.km || x.a.availableSince.getTime() - y.a.availableSince.getTime())[0]?.a;
  }
}

/** Strategy: delivery fee. */
export interface DeliveryFeeStrategy {
  fee(distanceKm: number, itemsTotalPaise: number): number;
}
export const DELIVERY_FEE_STRATEGY = Symbol('DELIVERY_FEE_STRATEGY');

/** ₹25 for the first 2 km, then ₹8 per started km. Free over ₹499. */
export class DistanceFeeStrategy implements DeliveryFeeStrategy {
  fee(km: number, itemsTotal: number): number {
    if (itemsTotal >= 499_00) return 0;
    return 25_00 + Math.max(0, Math.ceil(km - 2)) * 8_00;
  }
}
