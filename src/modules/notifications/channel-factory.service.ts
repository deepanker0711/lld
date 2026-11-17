import { Inject, Injectable } from '@nestjs/common';
import { CHANNEL_SENDERS, type ChannelSender } from './domain/channel-sender';
import {
  ALL_CHANNELS,
  NotificationChannel,
} from './domain/notification-channel';

/**
 * Factory: channel → sender. Built once at startup from every ChannelSender provider.
 *
 * Unlike the job HandlerRegistry, a missing entry here is never the client's fault:
 * the DTO already restricts channels to the enum. So the checks are at boot:
 * a duplicate or an enum value with no sender crashes startup instead of failing sends.
 */
@Injectable()
export class ChannelFactory {
  private readonly senders = new Map<NotificationChannel, ChannelSender>();

  constructor(@Inject(CHANNEL_SENDERS) senders: ChannelSender[]) {
    for (const sender of senders) {
      if (this.senders.has(sender.channel)) {
        throw new Error(`Duplicate sender for channel '${sender.channel}'`);
      }
      this.senders.set(sender.channel, sender);
    }
    const missing = ALL_CHANNELS.filter((c) => !this.senders.has(c));
    if (missing.length > 0) {
      throw new Error(`No sender for channel(s): ${missing.join(', ')}`);
    }
  }

  get(channel: NotificationChannel): ChannelSender {
    // Non-null: the constructor guarantees every enum value has a sender.
    return this.senders.get(channel)!;
  }
}
