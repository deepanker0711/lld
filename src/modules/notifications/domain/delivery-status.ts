export enum DeliveryStatus {
  PENDING = 'PENDING',
  SENDING = 'SENDING',
  SENT = 'SENT',
  FAILED = 'FAILED',
}

/**
 * Same State-pattern table as the job scheduler.
 *
 *               ┌──── transient error, attempts left (retry after backoff) ────┐
 *               ▼                                                              │
 *   ──► PENDING ──── dispatcher picks it ────► SENDING ────────────────────────┤
 *               │                                                              ├──► SENT
 *               └──► FAILED (no recipient: nothing to retry)                   └──► FAILED
 *
 * Every delivery is created PENDING and only the dispatcher moves it on, so there
 * is one writer for the outcome.
 */
export const DELIVERY_TRANSITIONS: Record<
  DeliveryStatus,
  readonly DeliveryStatus[]
> = {
  [DeliveryStatus.PENDING]: [DeliveryStatus.SENDING, DeliveryStatus.FAILED],
  [DeliveryStatus.SENDING]: [
    DeliveryStatus.SENT,
    DeliveryStatus.PENDING,
    DeliveryStatus.FAILED,
  ],
  [DeliveryStatus.SENT]: [],
  [DeliveryStatus.FAILED]: [],
};

/** Programmer error if this throws: the dispatcher is the only caller. */
export function assertDeliveryTransition(
  from: DeliveryStatus,
  to: DeliveryStatus,
  deliveryId: string,
): void {
  if (!DELIVERY_TRANSITIONS[from].includes(to)) {
    throw new Error(
      `Delivery '${deliveryId}' cannot move from ${from} to ${to}`,
    );
  }
}

/** The notification's overall status, derived from its deliveries (never stored). */
export type NotificationStatus = 'IN_PROGRESS' | 'SENT' | 'PARTIAL' | 'FAILED';

export function aggregateStatus(
  statuses: DeliveryStatus[],
): NotificationStatus {
  if (
    statuses.some(
      (s) => s === DeliveryStatus.PENDING || s === DeliveryStatus.SENDING,
    )
  ) {
    return 'IN_PROGRESS';
  }
  if (statuses.every((s) => s === DeliveryStatus.SENT)) return 'SENT';
  if (statuses.every((s) => s === DeliveryStatus.FAILED)) return 'FAILED';
  return 'PARTIAL';
}
