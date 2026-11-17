import { Clock } from '../../../common/utils/clock';
import { ChannelFactory } from '../channel-factory.service';
import {
  EmailChannelSender,
  PushChannelSender,
  SmsChannelSender,
} from '../channels';
import { DeliveryRepository } from '../delivery.repository';
import { NotificationChannel } from '../domain/notification-channel';
import {
  DEFAULT_NOTIFICATION_OPTIONS,
  type NotificationOptions,
} from '../domain/notification-options';
import { NotificationDispatcher } from '../notification-dispatcher.service';
import { NotificationEventBus } from '../notification-event-bus';
import { NotificationRepository } from '../notification.repository';
import { NotificationsService } from '../notifications.service';
import { TemplateRepository } from '../template.repository';
import { TemplatesService } from '../templates.service';
import { UserRepository } from '../user.repository';
import { UsersService } from '../users.service';

/**
 * Real services wired by hand (no Nest container). Fake senders with no latency.
 * The dispatcher uses the real Clock: tests fake time with vi.useFakeTimers (which also fakes Date).
 * Call dispatcher.onModuleInit() to subscribe it, as Nest would.
 */
export function createNotificationKit(
  overrides: Partial<NotificationOptions> = {},
) {
  const options = {
    ...DEFAULT_NOTIFICATION_OPTIONS,
    fakeLatencyMs: 0,
    ...overrides,
  };
  const users = new UsersService(new UserRepository());
  const templates = new TemplatesService(new TemplateRepository());
  const factory = new ChannelFactory([
    new EmailChannelSender(options),
    new SmsChannelSender(options),
    new PushChannelSender(options),
  ]);
  const notifications = new NotificationRepository();
  const deliveries = new DeliveryRepository();
  const bus = new NotificationEventBus();
  const service = new NotificationsService(
    notifications,
    deliveries,
    users,
    templates,
    factory,
    bus,
    options,
  );
  const dispatcher = new NotificationDispatcher(
    deliveries,
    factory,
    bus,
    new Clock(),
    options,
  );

  /** The ticket's scenario: EMAIL variant with subject + a default for other channels. */
  const seedLeaveTemplates = () => {
    templates.create({
      key: 'leave_approved',
      channel: NotificationChannel.EMAIL,
      subject: 'Leave approved',
      body: 'Hi {{name}}, your leave from {{from}} is approved',
    });
    templates.create({
      key: 'leave_approved',
      body: 'Leave from {{from}} approved',
    });
  };

  return {
    options,
    users,
    templates,
    factory,
    notifications,
    deliveries,
    bus,
    service,
    dispatcher,
    seedLeaveTemplates,
  };
}
