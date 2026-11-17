import { Logger } from '@nestjs/common';
import { generateId } from '../../../common/utils/id.generator';
import { sleep } from '../../../common/utils/sleep';
import {
  type ChannelSender,
  type OutgoingMessage,
  PermanentDeliveryError,
  type SendResult,
} from '../domain/channel-sender';
import type { NotificationChannel } from '../domain/notification-channel';
import type { NotificationOptions } from '../domain/notification-options';
import type { User } from '../entities/user.entity';

/**
 * Template method: send() is the fixed algorithm (wait, maybe fail, log, return an id);
 * subclasses only fill in which channel they are and where the address lives.
 *
 * Deterministic failures, so the demo is repeatable (recipient text decides):
 *   contains "bounce" → PermanentDeliveryError (no retry)
 *   contains "fail"   → transient error every time (retried, then FAILED)
 *   contains "flaky"  → transient error on the first call only (SENT on the retry)
 *   anything else     → fails at random with options.fakeFailRate
 */
export abstract class FakeChannelSender implements ChannelSender {
  abstract readonly channel: NotificationChannel;
  abstract recipientOf(user: User): string | null;

  protected readonly logger = new Logger(this.constructor.name);
  /** Calls per recipient, for the "flaky" rule. */
  private readonly callsTo = new Map<string, number>();

  constructor(protected readonly options: NotificationOptions) {}

  async send(to: string, message: OutgoingMessage): Promise<SendResult> {
    const call = (this.callsTo.get(to) ?? 0) + 1;
    this.callsTo.set(to, call);

    // Pretend to call the provider API. Skipped at 0 so tests don't need to advance timers.
    if (this.options.fakeLatencyMs > 0) await sleep(this.options.fakeLatencyMs);

    if (to.includes('bounce')) {
      throw new PermanentDeliveryError(
        `${this.channel} provider: hard bounce for ${to}`,
      );
    }
    if (to.includes('fail')) {
      throw new Error(`${this.channel} provider unavailable (simulated)`);
    }
    if (to.includes('flaky') && call === 1) {
      throw new Error(
        `${this.channel} provider timeout (simulated, first call)`,
      );
    }
    if (Math.random() < this.options.fakeFailRate) {
      throw new Error(`${this.channel} provider random failure (simulated)`);
    }

    const providerId = generateId(this.channel.toLowerCase());
    this.logger.log(
      `→ ${to}: ${message.subject ? `[${message.subject}] ` : ''}${message.body}`,
    );
    return { providerId };
  }
}
