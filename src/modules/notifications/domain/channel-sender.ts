import type { User } from '../entities/user.entity';
import type { NotificationChannel } from './notification-channel';

/** What a channel actually sends: already rendered, no placeholders left. */
export interface OutgoingMessage {
  subject: string | null;
  body: string;
}

export interface SendResult {
  /** The provider's id for the message (SES MessageId, Twilio SID, FCM name). */
  providerId: string;
}

/**
 * Strategy: one implementation per channel. The dispatcher only talks to this
 * interface, so adding WHATSAPP = one new class + one enum value, no `switch`.
 *
 * (Named ChannelSender because NotificationChannel is already the enum.)
 */
export interface ChannelSender {
  readonly channel: NotificationChannel;

  /** This channel's address for the user, or null if the user has none (no phone for SMS). */
  recipientOf(user: User): string | null;

  /** Resolves on success. Throws to fail: PermanentDeliveryError = don't retry. */
  send(to: string, message: OutgoingMessage): Promise<SendResult>;
}

/** DI token for "every ChannelSender", like JOB_HANDLERS in the job scheduler. */
export const CHANNEL_SENDERS = Symbol('CHANNEL_SENDERS');

/**
 * A failure that will fail again on retry: hard bounce, invalid number, unregistered
 * device token. Anything else thrown (timeout, 5xx, rate limit) is treated as transient.
 */
export class PermanentDeliveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermanentDeliveryError';
  }
}
