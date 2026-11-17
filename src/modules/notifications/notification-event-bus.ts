import { Injectable } from '@nestjs/common';
import { TypedEventBus } from '../../common/events/typed-event-bus';

/** Event name → payload. */
export interface NotificationEvents {
  /** A delivery is PENDING and due now (first try, or a retry whose backoff ended). */
  'delivery.ready': { deliveryId: string };
}

/**
 * Observer: publishers don't know who listens. NotificationsService publishes,
 * the dispatcher subscribes. publish() defers with setImmediate (see TypedEventBus),
 * which is what keeps sending out of the request path.
 */
@Injectable()
export class NotificationEventBus extends TypedEventBus<NotificationEvents> {}
