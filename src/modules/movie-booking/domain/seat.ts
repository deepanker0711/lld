export enum SeatType {
  REGULAR = 'REGULAR',
  PREMIUM = 'PREMIUM',
  RECLINER = 'RECLINER',
}

export const ALL_SEAT_TYPES = Object.values(SeatType);

export interface SeatRow {
  /** 'A', 'B', … */
  row: string;
  seats: number;
  type: SeatType;
}

export interface Seat {
  code: string; // "A7"
  row: string;
  number: number;
  type: SeatType;
}

export function expandLayout(rows: SeatRow[]): Seat[] {
  return rows.flatMap((r) =>
    Array.from({ length: r.seats }, (_, i) => ({ code: `${r.row}${i + 1}`, row: r.row, number: i + 1, type: r.type })),
  );
}
