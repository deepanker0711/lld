import { BaseEntity } from '../../../common/entities/base.entity';
import { GeoPoint } from '../domain/geo';
import { FoodOrderStatus } from '../domain/order-status';

export interface MenuItem {
  id: string;
  name: string;
  pricePaise: number;
  available: boolean;
}

export class Restaurant extends BaseEntity {
  name: string;
  location: GeoPoint;
  isOpen: boolean;
  menu: MenuItem[];
}

export enum AgentStatus {
  AVAILABLE = 'AVAILABLE',
  BUSY = 'BUSY',
  OFFLINE = 'OFFLINE',
}

export class DeliveryAgent extends BaseEntity {
  name: string;
  location: GeoPoint;
  status: AgentStatus;
  currentOrderId: string | null;
  /** Fairness tie-break: who has waited longest. */
  availableSince: Date;
}

export interface FoodOrderLine {
  menuItemId: string;
  name: string;
  unitPricePaise: number;
  qty: number;
}

export class FoodOrder extends BaseEntity {
  customerId: string;
  restaurantId: string;
  lines: FoodOrderLine[];
  deliveryLocation: GeoPoint;
  distanceKm: number;
  itemsTotalPaise: number;
  deliveryFeePaise: number;
  totalPaise: number;
  status: FoodOrderStatus;
  /** null until an agent is free; assigned when the restaurant accepts. */
  agentId: string | null;
  history: { status: FoodOrderStatus; at: Date; by: string; note?: string }[];
}
