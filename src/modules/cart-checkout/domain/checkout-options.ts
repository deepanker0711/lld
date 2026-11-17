export interface CheckoutOptions {
  /** GST on (subtotal − discount), in basis points: 1800 = 18%. */
  taxBps: number;
  /** Most units of one product per cart line. */
  maxQtyPerLine: number;
  maxLines: number;
  /** Fake payment gateway latency. */
  paymentLatencyMs: number;
}

export const DEFAULT_CHECKOUT_OPTIONS: CheckoutOptions = {
  taxBps: 1800,
  maxQtyPerLine: 10,
  maxLines: 50,
  paymentLatencyMs: 100,
};

export const CHECKOUT_OPTIONS = Symbol('CHECKOUT_OPTIONS');
