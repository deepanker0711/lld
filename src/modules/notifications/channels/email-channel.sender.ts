import { Inject, Injectable } from '@nestjs/common';
import { NotificationChannel } from '../domain/notification-channel';
import {
  NOTIFICATION_OPTIONS,
  type NotificationOptions,
} from '../domain/notification-options';
import type { User } from '../entities/user.entity';
import { FakeChannelSender } from './fake-channel-sender';

@Injectable()
export class EmailChannelSender extends FakeChannelSender {
  readonly channel = NotificationChannel.EMAIL;

  constructor(@Inject(NOTIFICATION_OPTIONS) options: NotificationOptions) {
    super(options);
  }

  recipientOf(user: User): string | null {
    return user.email;
  }
}
