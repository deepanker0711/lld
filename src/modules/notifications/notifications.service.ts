import { Inject, Injectable } from '@nestjs/common';
import {
  BadRequestError,
  UnprocessableError,
} from '../../common/errors/domain.errors';
import {
  type Page,
  paginate,
  PaginationDto,
} from '../../common/dto/pagination.dto';
import { ChannelFactory } from './channel-factory.service';
import { DeliveryRepository } from './delivery.repository';
import {
  aggregateStatus,
  DeliveryStatus,
  type NotificationStatus,
} from './domain/delivery-status';
import {
  NOTIFICATION_OPTIONS,
  type NotificationOptions,
} from './domain/notification-options';
import {
  findMissingVariables,
  renderTemplate,
} from './domain/template-renderer';
import { SendNotificationDto } from './dto/send-notification.dto';
import { Delivery } from './entities/delivery.entity';
import { Notification } from './entities/notification.entity';
import { NotificationEventBus } from './notification-event-bus';
import { NotificationRepository } from './notification.repository';
import { TemplatesService } from './templates.service';
import { UsersService } from './users.service';

export type NotificationView = Notification & {
  status: NotificationStatus;
  deliveries: Delivery[];
};

@Injectable()
export class NotificationsService {
  constructor(
    private readonly notifications: NotificationRepository,
    private readonly deliveries: DeliveryRepository,
    private readonly users: UsersService,
    private readonly templates: TemplatesService,
    private readonly channels: ChannelFactory,
    private readonly bus: NotificationEventBus,
    @Inject(NOTIFICATION_OPTIONS) private readonly options: NotificationOptions,
  ) {}

  /**
   * Validate everything that can be known now, store PENDING deliveries, hand off, return.
   * Nothing is sent here: that's the dispatcher's job (202 Accepted, not 201 Created).
   */
  send(dto: SendNotificationDto): NotificationView {
    const user = this.users.get(dto.userId); // 404
    this.templates.getByKey(dto.templateKey); // 404 if the key has no variants at all

    // 1. Preferences: opted-out channels are skipped, not errors. All skipped → 422.
    const wanted = dto.channels.filter((c) => user.preferences[c]);
    const optedOut = dto.channels.filter((c) => !user.preferences[c]);
    if (wanted.length === 0) {
      throw new UnprocessableError('All requested channels are opted out', {
        optedOut,
      });
    }

    // 2. A template for each channel we'll actually send on (own variant, else default).
    const plan = wanted.map((channel) => ({
      channel,
      template: this.templates.resolve(dto.templateKey, channel),
    }));
    const noTemplate = plan.filter((p) => !p.template).map((p) => p.channel);
    if (noTemplate.length > 0) {
      throw new BadRequestError(
        `Template '${dto.templateKey}' has no variant for ${noTemplate.join(', ')} and no default`,
        { channels: noTemplate },
      );
    }

    // 3. Every placeholder of every chosen variant must have data. One 400 lists them all.
    const missing = [
      ...new Set(
        plan.flatMap((p) =>
          findMissingVariables(p.template!.variables, dto.data),
        ),
      ),
    ];
    if (missing.length > 0) {
      throw new BadRequestError(
        `Missing template variables: ${missing.join(', ')}`,
        { missing },
      );
    }

    // 4. All checks passed: store. Rendering can't throw now (step 3 proved the data is there).
    const notification = this.notifications.create({
      userId: user.id,
      templateKey: dto.templateKey,
      data: dto.data,
      requestedChannels: dto.channels,
      skipped: optedOut.map((channel) => ({ channel, reason: 'OPTED_OUT' })),
    });
    const deliveries = plan.map(({ channel, template }) =>
      this.deliveries.create({
        notificationId: notification.id,
        channel,
        templateId: template!.id,
        recipient: this.channels.get(channel).recipientOf(user),
        subject:
          template!.subject && renderTemplate(template!.subject, dto.data),
        body: renderTemplate(template!.body, dto.data),
        status: DeliveryStatus.PENDING,
        attempts: 0,
        maxAttempts: this.options.maxAttempts,
        nextAttemptAt: null,
        lastError: null,
        providerId: null,
        sentAt: null,
      }),
    );

    // 5. Hand off. One event per delivery: channels succeed, fail and retry independently.
    for (const d of deliveries) {
      this.bus.publish('delivery.ready', { deliveryId: d.id });
    }
    return this.toView(notification, deliveries);
  }

  get(id: string): NotificationView {
    const notification = this.notifications.findByIdOrThrow(id);
    return this.toView(notification, this.deliveries.findByNotification(id));
  }

  /** Newest first. Only the page's notifications get their deliveries loaded. */
  listForUser(userId: string, query: PaginationDto): Page<NotificationView> {
    this.users.get(userId); // 404 for an unknown user, rather than an empty page
    const page = paginate(this.notifications.findByUser(userId), query);
    return {
      ...page,
      items: page.items.map((n) =>
        this.toView(n, this.deliveries.findByNotification(n.id)),
      ),
    };
  }

  private toView(n: Notification, deliveries: Delivery[]): NotificationView {
    return {
      ...n,
      status: aggregateStatus(deliveries.map((d) => d.status)),
      // Copies: the dispatcher mutates the stored rows, the response is a snapshot.
      deliveries: deliveries.map((d) => ({ ...d })),
    };
  }
}
