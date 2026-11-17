/** Port to the payment provider. The only `await` in checkout. */
export interface PaymentGateway {
  /** Throws PaymentDeclinedError on a definite decline. */
  charge(reference: string, amountPaise: number, paymentToken: string): Promise<{ paymentId: string }>;
  refund(paymentId: string, amountPaise: number): Promise<{ refundId: string }>;
}

export class PaymentDeclinedError extends Error {}

export const PAYMENT_GATEWAY = Symbol('CHECKOUT_PAYMENT_GATEWAY');
