import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import type { UpdateInput } from '../../common/repository/repository.interface';
import { backoffDelay } from '../../common/utils/backoff';
import { Clock } from '../../common/utils/clock';
import { sleep } from '../../common/utils/sleep';
import { ChannelFactory } from './channel-factory.service';
import { DeliveryRepository } from './delivery.repository';
import {
  PermanentDeliveryError,
  type SendResult,
} from './domain/channel-sender';
import {
  assertDeliveryTransition,
  DeliveryStatus,
} from './domain/delivery-status';
import {
  NOTIFICATION_OPTIONS,
  type NotificationOptions,
} from './domain/notification-options';
import { Delivery } from './entities/delivery.entity';
import { NotificationEventBus } from './notification-event-bus';

/**
 * Consumer side of the bus: one 'delivery.ready' event = one send attempt.
 *
 *   PENDING ─► SENDING ─► sender.send() ─┬─ ok ─────────────────────────────► SENT
 *                                        ├─ permanent / out of attempts ─────► FAILED
 *                                        └─ transient, attempts left ─► PENDING + timer(backoff)
 *                                                                          └─► publish 'delivery.ready' again
 *
 * Retries go back through the bus instead of calling attempt() directly: that's what a
 * real queue does (re-enqueue with a delay), so swapping the bus for SQS/BullMQ keeps
 * this class the same.
 */
@Injectable()
export class NotificationDispatcher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationDispatcher.name);
  /** Attempts currently awaiting a provider. Awaited on shutdown. */
  private readonly inFlight = new Set<Promise<void>>();
  /** deliveryId → pending retry timer. Cleared on shutdown. */
  private readonly retryTimers = new Map<string, NodeJS.Timeout>();
  private unsubscribe?: () => void;
  private stopped = false;

  constructor(
    private readonly deliveries: DeliveryRepository,
    private readonly channels: ChannelFactory,
    private readonly bus: NotificationEventBus,
    private readonly clock: Clock,
    @Inject(NOTIFICATION_OPTIONS) private readonly options: NotificationOptions,
  ) {}

  onModuleInit(): void {
    this.unsubscribe = this.bus.subscribe('delivery.ready', ({ deliveryId }) =>
      this.dispatch(deliveryId),
    );
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    this.unsubscribe?.();
    // Deliveries waiting on a retry stay PENDING with nextAttemptAt set. With a durable
    // queue they'd be picked up after restart; in memory they're simply lost with the process.
    for (const timer of this.retryTimers.values()) clearTimeout(timer);
    this.retryTimers.clear();
    await Promise.race([
      Promise.allSettled([...this.inFlight]),
      sleep(this.options.shutdownTimeoutMs),
    ]);
  }

  /** Event listener: fire-and-forget, but tracked, and never an unhandled rejection. */
  dispatch(deliveryId: string): void {
    if (this.stopped) return;
    const run: Promise<void> = this.attempt(deliveryId)
      .catch((err: unknown) =>
        this.logger.error(`Dispatch of ${deliveryId} crashed: ${String(err)}`),
      )
      .finally(() => this.inFlight.delete(run));
    this.inFlight.add(run);
  }

  /** One try at one delivery. Public so tests can await it directly. */
  async attempt(deliveryId: string): Promise<void> {
    const delivery = this.deliveries.findById(deliveryId);
    // Idempotent consumer: a duplicate or late event for a delivery that has already
    // moved on (SENDING/SENT/FAILED) does nothing. Queues deliver at-least-once.
    if (!delivery || delivery.status !== DeliveryStatus.PENDING) return;

    if (delivery.recipient === null) {
      // Nothing a retry could fix.
      this.move(delivery, DeliveryStatus.FAILED, {
        lastError: `No recipient: user has no ${delivery.channel} address`,
      });
      return;
    }

    this.move(delivery, DeliveryStatus.SENDING, {
      attempts: delivery.attempts + 1,
      nextAttemptAt: null,
    });

    let result: SendResult;
    try {
      result = await this.channels
        .get(delivery.channel)
        .send(delivery.recipient, {
          subject: delivery.subject,
          body: delivery.body,
        });
    } catch (err) {
      this.onFailure(delivery, err);
      return;
    }
    // lastError is kept on success: "SENT on attempt 2, after: timeout" is useful history.
    this.move(delivery, DeliveryStatus.SENT, {
      providerId: result.providerId,
      sentAt: this.clock.date(),
    });
  }

  private onFailure(delivery: Delivery, err: unknown): void {
    const message = err instanceof Error ? err.message : String(err);
    const permanent = err instanceof PermanentDeliveryError;

    if (permanent || delivery.attempts >= delivery.maxAttempts) {
      this.move(delivery, DeliveryStatus.FAILED, { lastError: message });
      this.logger.warn(
        `${delivery.id} ${delivery.channel} FAILED after ${delivery.attempts} attempt(s): ${message}`,
      );
      return;
    }

    const delay = backoffDelay(
      delivery.attempts,
      this.options.baseBackoffMs,
      this.options.maxBackoffMs,
    );
    this.move(delivery, DeliveryStatus.PENDING, {
      lastError: message,
      nextAttemptAt: new Date(this.clock.now() + delay),
    });
    this.logger.warn(
      `${delivery.id} ${delivery.channel} attempt ${delivery.attempts} failed (${message}); retry in ${delay}ms`,
    );
    this.scheduleRetry(delivery.id, delay);
  }

  private scheduleRetry(deliveryId: string, delayMs: number): void {
    const timer = setTimeout(() => {
      this.retryTimers.delete(deliveryId);
      this.bus.publish('delivery.ready', { deliveryId });
    }, delayMs);
    timer.unref(); // a pending retry must not keep the process alive
    this.retryTimers.set(deliveryId, timer);
  }

  private move(
    delivery: Delivery,
    to: DeliveryStatus,
    patch: UpdateInput<Delivery> = {},
  ): void {
    assertDeliveryTransition(delivery.status, to, delivery.id);
    this.deliveries.update(delivery.id, { ...patch, status: to });
  }

  /** For stats/tests. */
  get pendingRetries(): number {
    return this.retryTimers.size;
  }
}
