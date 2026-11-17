import { Seat, SeatType } from './seat';

export interface PriceQuote {
  seats: { code: string; type: SeatType; pricePaise: number }[];
  ticketsPaise: number;
  convenienceFeePaise: number;
  totalPaise: number;
}

/** Strategy: how a show's seats are priced. Weekend surge, dynamic pricing etc. are new classes. */
export interface PricingStrategy {
  quote(seats: Seat[], prices: Record<SeatType, number>, startsAt: Date): PriceQuote;
}

export const PRICING_STRATEGY = Symbol('PRICING_STRATEGY');

/** Show price per seat type, +10% on Fri–Sun shows (in the venue's zone), + a flat fee per ticket. */
export class StandardPricing implements PricingStrategy {
  constructor(
    private readonly feePerSeatPaise = 30_00,
    private readonly weekendSurgeBps = 1000,
    private readonly timeZone = 'Asia/Kolkata',
  ) {}

  quote(seats: Seat[], prices: Record<SeatType, number>, startsAt: Date): PriceQuote {
    const weekday = new Intl.DateTimeFormat('en-US', { timeZone: this.timeZone, weekday: 'short' }).format(startsAt);
    const surge = ['Fri', 'Sat', 'Sun'].includes(weekday) ? this.weekendSurgeBps : 0;
    const priced = seats.map((s) => ({
      code: s.code,
      type: s.type,
      pricePaise: Math.round((prices[s.type] * (10_000 + surge)) / 10_000),
    }));
    const ticketsPaise = priced.reduce((sum, s) => sum + s.pricePaise, 0);
    const convenienceFeePaise = this.feePerSeatPaise * seats.length;
    return { seats: priced, ticketsPaise, convenienceFeePaise, totalPaise: ticketsPaise + convenienceFeePaise };
  }
}
