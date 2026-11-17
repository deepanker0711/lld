import { BaseEntity } from '../../../common/entities/base.entity';
import { DeliveryStatus } from '../domain/delivery-status';
import { NotificationChannel } from '../domain/notification-channel';

/**
 * One channel of one notification: the unit the dispatcher sends and retries.
 *
 * subject/body are rendered at creation and stored: retries send exactly the same text,
 * and "what did we send?" has an answer even if the template changes later.
 */
export class Delivery extends BaseEntity {
  notificationId: string;
  channel: NotificationChannel;
  /** Which template variant was used, e.g. "leave_approved:DEFAULT". */
  templateId: string;
  /** Snapshot of the user's address at send time. null = user has none for this channel. */
  recipient: string | null;
  subject: string | null;
  body: string;

  status: DeliveryStatus;
  attempts: number;
  maxAttempts: number;
  /** When the next retry is due. null unless a retry is scheduled. */
  nextAttemptAt: Date | null;
  lastError: string | null;
  providerId: string | null;
  sentAt: Date | null;
}
