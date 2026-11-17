export interface PaymentGateway {
  charge(reference: string, amountPaise: number, paymentToken: string): Promise<{ paymentId: string }>;
  refund(paymentId: string, amountPaise: number): Promise<void>;
}

export class PaymentDeclinedError extends Error {}

export const PAYMENT_GATEWAY = Symbol('BOOKING_PAYMENT_GATEWAY');
