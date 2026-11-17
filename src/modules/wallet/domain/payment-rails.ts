/** Port to the outside world: card/UPI collection for top-ups, bank payouts for withdrawals. */
export interface PaymentRails {
  collect(reference: string, amountPaise: number, paymentToken: string): Promise<{ externalRef: string }>;
  payout(reference: string, amountPaise: number, bankAccount: string): Promise<{ externalRef: string }>;
}

export class RailsDeclinedError extends Error {}

export const PAYMENT_RAILS = Symbol('PAYMENT_RAILS');
