/**
 * The one async step in this module. Unpark awaits it, which is exactly what makes
 * a lock necessary there (see ParkingService.unpark).
 */
export interface PaymentGateway {
  charge(reference: string, amount: number): Promise<{ paymentId: string }>;
}

export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');
