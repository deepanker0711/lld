export interface DeliveryOptions {
  /** Restaurants deliver within this radius. */
  maxDeliveryKm: number;
  maxItemsPerOrder: number;
}

export const DEFAULT_DELIVERY_OPTIONS: DeliveryOptions = { maxDeliveryKm: 10, maxItemsPerOrder: 20 };
export const DELIVERY_OPTIONS = Symbol('DELIVERY_OPTIONS');
