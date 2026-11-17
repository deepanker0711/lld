import { Module } from '@nestjs/common';
import { ChannelFactory } from './channel-factory.service';
import { DeliveryRepository } from './delivery.repository';
import { CHANNEL_SENDER_CLASSES } from './channels';
import { CHANNEL_SENDERS, type ChannelSender } from './domain/channel-sender';
import {
  NOTIFICATION_OPTIONS,
  notificationOptionsFromEnv,
} from './domain/notification-options';
import { NotificationDispatcher } from './notification-dispatcher.service';
import { NotificationEventBus } from './notification-event-bus';
import { NotificationRepository } from './notification.repository';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { TemplateRepository } from './template.repository';
import { TemplatesController } from './templates.controller';
import { TemplatesService } from './templates.service';
import { UserRepository } from './user.repository';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  controllers: [UsersController, TemplatesController, NotificationsController],
  providers: [
    UserRepository,
    TemplateRepository,
    UsersService,
    TemplatesService,
    {
      provide: NOTIFICATION_OPTIONS,
      useFactory: () => notificationOptionsFromEnv(),
    },
    ...CHANNEL_SENDER_CLASSES,
    // Collect every sender instance into one array under a single token.
    {
      provide: CHANNEL_SENDERS,
      useFactory: (...senders: ChannelSender[]) => senders,
      inject: CHANNEL_SENDER_CLASSES,
    },
    ChannelFactory,
    NotificationRepository,
    DeliveryRepository,
    NotificationEventBus,
    NotificationsService,
    NotificationDispatcher,
  ],
})
export class NotificationsModule {}
