import { BaseEntity } from '../../../common/entities/base.entity';
import { NotificationChannel } from '../domain/notification-channel';

export interface SkippedChannel {
  channel: NotificationChannel;
  reason: 'OPTED_OUT';
}

/**
 * One send request. The per-channel work lives in Delivery rows; the notification's
 * status is derived from them (aggregateStatus), so the two can never disagree.
 */
export class Notification extends BaseEntity {
  userId: string;
  templateKey: string;
  data: Record<string, unknown>;
  /** What the client asked for, before preferences were applied. */
  requestedChannels: NotificationChannel[];
  /** Requested but not sent, and why. No Delivery is created for these. */
  skipped: SkippedChannel[];
}
