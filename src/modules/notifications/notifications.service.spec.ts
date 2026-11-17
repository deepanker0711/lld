import { DeliveryStatus } from './domain/delivery-status';
import { NotificationChannel as C } from './domain/notification-channel';
import { createNotificationKit } from './testing/notification-test-kit';

describe('NotificationsService.send (T4)', () => {
  let kit: ReturnType<typeof createNotificationKit>;
  let publish: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    kit = createNotificationKit();
    kit.seedLeaveTemplates();
    publish = vi.spyOn(kit.bus, 'publish').mockImplementation(() => undefined);
  });

  const asha = () =>
    kit.users.create({
      name: 'Asha',
      email: 'asha@x.com',
      deviceToken: 'tok-1',
    });
  const data = { name: 'Asha', from: '1 Nov' };

  it('renders per-channel variants, stores PENDING deliveries and publishes one event each', () => {
    const user = asha();
    const view = kit.service.send({
      userId: user.id,
      templateKey: 'leave_approved',
      channels: [C.EMAIL, C.PUSH],
      data,
    });

    expect(view.id).toMatch(/^ntf_/);
    expect(view.status).toBe('IN_PROGRESS');
    expect(
      view.deliveries.map((d) => [d.channel, d.templateId, d.recipient]),
    ).toEqual([
      [C.EMAIL, 'leave_approved:EMAIL', 'asha@x.com'],
      [C.PUSH, 'leave_approved:DEFAULT', 'tok-1'],
    ]);
    const [email, push] = view.deliveries;
    expect(email.subject).toBe('Leave approved');
    expect(email.body).toBe('Hi Asha, your leave from 1 Nov is approved');
    expect(push.subject).toBeNull();
    expect(push.body).toBe('Leave from 1 Nov approved');
    expect(
      view.deliveries.every((d) => d.status === DeliveryStatus.PENDING),
    ).toBe(true);
    expect(
      view.deliveries.every((d) => d.maxAttempts === 3 && d.attempts === 0),
    ).toBe(true);

    expect(publish.mock.calls).toEqual([
      ['delivery.ready', { deliveryId: email.id }],
      ['delivery.ready', { deliveryId: push.id }],
    ]);
  });

  it('keeps a channel with no address as a PENDING delivery with recipient null', () => {
    const view = kit.service.send({
      userId: asha().id,
      templateKey: 'leave_approved',
      channels: [C.EMAIL, C.SMS],
      data,
    });
    expect(view.deliveries[1]).toMatchObject({
      channel: C.SMS,
      recipient: null,
      status: 'PENDING',
    });
  });

  it('skips opted-out channels and records why', () => {
    const user = asha();
    kit.users.updatePreferences(user.id, { channels: { PUSH: false } });
    const view = kit.service.send({
      userId: user.id,
      templateKey: 'leave_approved',
      channels: [C.EMAIL, C.PUSH],
      data,
    });
    expect(view.deliveries.map((d) => d.channel)).toEqual([C.EMAIL]);
    expect(view.skipped).toEqual([{ channel: C.PUSH, reason: 'OPTED_OUT' }]);
    expect(view.requestedChannels).toEqual([C.EMAIL, C.PUSH]);
  });

  it('422 when every requested channel is opted out', () => {
    const user = asha();
    kit.users.updatePreferences(user.id, { channels: { EMAIL: false } });
    const err = (() => {
      try {
        kit.service.send({
          userId: user.id,
          templateKey: 'leave_approved',
          channels: [C.EMAIL],
          data,
        });
      } catch (e) {
        return e;
      }
    })();
    expect(err).toMatchObject({
      httpStatus: 422,
      details: { optedOut: [C.EMAIL] },
    });
  });

  it('400 listing every missing variable across the chosen variants, before storing anything', () => {
    const user = asha();
    expect(() =>
      kit.service.send({
        userId: user.id,
        templateKey: 'leave_approved',
        channels: [C.EMAIL, C.PUSH],
        data: { name: 'Asha' },
      }),
    ).toThrow(
      expect.objectContaining({
        httpStatus: 400,
        details: { missing: ['from'] },
      }),
    );
    expect(kit.notifications.count()).toBe(0);
    expect(kit.deliveries.count()).toBe(0);
    expect(publish).not.toHaveBeenCalled();
  });

  it('400 when a channel has neither its own variant nor a default', () => {
    kit.templates.create({ key: 'otp', channel: C.SMS, body: 'Code {{code}}' });
    expect(() =>
      kit.service.send({
        userId: asha().id,
        templateKey: 'otp',
        channels: [C.SMS, C.EMAIL],
        data: { code: '1234' },
      }),
    ).toThrow("Template 'otp' has no variant for EMAIL and no default");
  });

  it('404 for an unknown user or template key', () => {
    const user = asha();
    expect(() =>
      kit.service.send({
        userId: 'usr_nope',
        templateKey: 'leave_approved',
        channels: [C.EMAIL],
        data,
      }),
    ).toThrow(expect.objectContaining({ httpStatus: 404 }));
    expect(() =>
      kit.service.send({
        userId: user.id,
        templateKey: 'nope',
        channels: [C.EMAIL],
        data,
      }),
    ).toThrow(expect.objectContaining({ httpStatus: 404 }));
  });
});

describe('NotificationsService reads (T6)', () => {
  it("gets one notification with deliveries and pages a user's history newest first", () => {
    const kit = createNotificationKit();
    kit.seedLeaveTemplates();
    vi.spyOn(kit.bus, 'publish').mockImplementation(() => undefined);
    const user = kit.users.create({ name: 'Asha', email: 'asha@x.com' });
    const ids = ['1 Nov', '2 Nov', '3 Nov'].map(
      (from) =>
        kit.service.send({
          userId: user.id,
          templateKey: 'leave_approved',
          channels: [C.EMAIL],
          data: { name: 'Asha', from },
        }).id,
    );

    const one = kit.service.get(ids[0]);
    expect(one.status).toBe('IN_PROGRESS');
    expect(one.deliveries[0].body).toContain('1 Nov');
    expect(() => kit.service.get('ntf_nope')).toThrow(
      expect.objectContaining({ httpStatus: 404 }),
    );

    const page = kit.service.listForUser(user.id, { page: 1, limit: 2 });
    expect(page.items.map((n) => n.id)).toEqual([ids[2], ids[1]]);
    expect(page).toMatchObject({ total: 3, totalPages: 2 });
    expect(page.items[0].deliveries).toHaveLength(1);
    expect(() =>
      kit.service.listForUser('usr_nope', { page: 1, limit: 2 }),
    ).toThrow(expect.objectContaining({ httpStatus: 404 }));
  });
});
