import { Logger } from '@nestjs/common';
import { DeliveryStatus as S } from './domain/delivery-status';
import { NotificationChannel as C } from './domain/notification-channel';
import { createNotificationKit } from './testing/notification-test-kit';

const NOW = Date.parse('2026-11-02T10:00:00.000Z');

describe('NotificationDispatcher (T5)', () => {
  let kit: ReturnType<typeof createNotificationKit>;

  beforeEach(() => {
    // Only timers + Date are faked. setImmediate stays real: fake immediates queued inside a
    // fake timer callback don't run during advanceTimersByTimeAsync, and the bus relies on them.
    vi.useFakeTimers({
      now: NOW,
      toFake: ['setTimeout', 'clearTimeout', 'Date'],
    });
    for (const level of ['log', 'warn', 'error'] as const) {
      vi.spyOn(Logger.prototype, level).mockImplementation(() => undefined);
    }
    kit = createNotificationKit();
    kit.seedLeaveTemplates();
    kit.dispatcher.onModuleInit();
  });

  afterEach(async () => {
    vi.useRealTimers(); // shutdown races a sleep(): it must be a real timer
    await kit.dispatcher.onModuleDestroy();
    vi.restoreAllMocks();
  });

  /** Lets the bus's setImmediate hand-off and the (0 ms) fake provider calls run. */
  const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
  /**
   * Move fake time, then let the retry it triggered run. Step one backoff at a time:
   * a retry fired mid-advance only runs at the settle(), i.e. at the end of the step.
   */
  const advance = async (ms: number) => {
    await vi.advanceTimersByTimeAsync(ms);
    await settle();
  };

  const send = (
    contacts: { email?: string; phone?: string; deviceToken?: string },
    channels: C[],
  ) => {
    const user = kit.users.create({ name: 'Asha', ...contacts });
    return kit.service.send({
      userId: user.id,
      templateKey: 'leave_approved',
      channels,
      data: { name: 'Asha', from: '1 Nov' },
    });
  };
  const delivery = (id: string) => kit.deliveries.findByIdOrThrow(id);
  const statusOf = (notificationId: string) =>
    kit.deliveries.findByNotification(notificationId).map((d) => d.status);

  it('does not send inside send(): the hand-off happens on the next tick', async () => {
    const sendSpy = vi.spyOn(kit.factory.get(C.EMAIL), 'send');
    const view = send({ email: 'asha@x.com' }, [C.EMAIL]);
    expect(sendSpy).not.toHaveBeenCalled();
    expect(view.deliveries[0].status).toBe(S.PENDING);

    await settle();
    expect(sendSpy).toHaveBeenCalledWith('asha@x.com', {
      subject: 'Leave approved',
      body: 'Hi Asha, your leave from 1 Nov is approved',
    });
    expect(delivery(view.deliveries[0].id)).toMatchObject({
      status: S.SENT,
      attempts: 1,
      lastError: null,
      sentAt: new Date(NOW),
      providerId: expect.stringMatching(/^email_/),
    });
  });

  it('fails a channel with no address right away and lets the others proceed', async () => {
    const sms = vi.spyOn(kit.factory.get(C.SMS), 'send');
    const view = send({ email: 'asha@x.com' }, [C.EMAIL, C.SMS]);
    await settle();

    const [email, smsDelivery] = view.deliveries.map((d) => delivery(d.id));
    expect(email.status).toBe(S.SENT);
    expect(smsDelivery).toMatchObject({
      status: S.FAILED,
      attempts: 0,
      lastError: 'No recipient: user has no SMS address',
    });
    expect(sms).not.toHaveBeenCalled();
  });

  it('retries a transient failure after the backoff and then succeeds ("flaky")', async () => {
    const view = send({ email: 'flaky@x.com' }, [C.EMAIL]);
    const id = view.deliveries[0].id;
    await settle();

    expect(delivery(id)).toMatchObject({
      status: S.PENDING,
      attempts: 1,
      lastError: expect.stringContaining('timeout'),
      nextAttemptAt: new Date(NOW + 1000),
    });
    expect(kit.dispatcher.pendingRetries).toBe(1);

    await advance(999);
    expect(delivery(id).status).toBe(S.PENDING);
    await advance(1);
    expect(delivery(id)).toMatchObject({
      status: S.SENT,
      attempts: 2,
      nextAttemptAt: null,
      sentAt: new Date(NOW + 1000),
      lastError: expect.stringContaining('timeout'), // kept as history
    });
  });

  it('backs off 1s then 2s and gives up after maxAttempts ("fail")', async () => {
    const sendSpy = vi.spyOn(kit.factory.get(C.EMAIL), 'send');
    const id = send({ email: 'fail@x.com' }, [C.EMAIL]).deliveries[0].id;

    await settle(); // attempt 1 at t=0
    expect(delivery(id).nextAttemptAt).toEqual(new Date(NOW + 1000));
    await advance(1000); // attempt 2 at t=1s
    expect(delivery(id)).toMatchObject({ status: S.PENDING, attempts: 2 });
    expect(delivery(id).nextAttemptAt).toEqual(new Date(NOW + 3000));
    await advance(1999);
    expect(sendSpy).toHaveBeenCalledTimes(2);
    await advance(1); // attempt 3 at t=3s → out of attempts
    expect(delivery(id)).toMatchObject({
      status: S.FAILED,
      attempts: 3,
      nextAttemptAt: null,
      lastError: 'EMAIL provider unavailable (simulated)',
    });

    await advance(60_000);
    expect(sendSpy).toHaveBeenCalledTimes(3);
    expect(kit.dispatcher.pendingRetries).toBe(0);
  });

  it('does not retry a permanent failure ("bounce")', async () => {
    const id = send({ email: 'bounce@x.com' }, [C.EMAIL]).deliveries[0].id;
    await settle();
    expect(delivery(id)).toMatchObject({
      status: S.FAILED,
      attempts: 1,
      lastError: expect.stringContaining('hard bounce'),
    });
    expect(kit.dispatcher.pendingRetries).toBe(0);
  });

  it('runs channels independently: one retrying does not hold up the other', async () => {
    const view = send({ email: 'fail@x.com', deviceToken: 'tok-1' }, [
      C.EMAIL,
      C.PUSH,
    ]);
    await settle();
    expect(statusOf(view.id)).toEqual([S.PENDING, S.SENT]);
    await advance(1000);
    await advance(2000);
    expect(statusOf(view.id)).toEqual([S.FAILED, S.SENT]);
  });

  it('ignores a duplicate event for a delivery that has moved on', async () => {
    const sendSpy = vi.spyOn(kit.factory.get(C.EMAIL), 'send');
    const id = send({ email: 'asha@x.com' }, [C.EMAIL]).deliveries[0].id;
    await settle();
    kit.bus.publish('delivery.ready', { deliveryId: id });
    kit.bus.publish('delivery.ready', { deliveryId: 'dlv_unknown' });
    await settle();
    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(delivery(id).status).toBe(S.SENT);
  });

  it('on shutdown, drops pending retries and stops listening', async () => {
    const sendSpy = vi.spyOn(kit.factory.get(C.EMAIL), 'send');
    const id = send({ email: 'fail@x.com' }, [C.EMAIL]).deliveries[0].id;
    await settle();
    expect(kit.dispatcher.pendingRetries).toBe(1);

    await kit.dispatcher.onModuleDestroy();
    expect(kit.dispatcher.pendingRetries).toBe(0);
    await advance(10_000);
    kit.bus.publish('delivery.ready', { deliveryId: id });
    await settle();
    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(delivery(id).status).toBe(S.PENDING); // a durable queue would resume it
  });
});
