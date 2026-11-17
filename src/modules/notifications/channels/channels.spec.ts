import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CommonModule } from '../../../common/common.module';
import { ChannelFactory } from '../channel-factory.service';
import { PermanentDeliveryError } from '../domain/channel-sender';
import { NotificationChannel } from '../domain/notification-channel';
import {
  DEFAULT_NOTIFICATION_OPTIONS,
  notificationOptionsFromEnv,
} from '../domain/notification-options';
import type { User } from '../entities/user.entity';
import { NotificationsModule } from '../notifications.module';
import {
  EmailChannelSender,
  PushChannelSender,
  SmsChannelSender,
} from './index';

const options = { ...DEFAULT_NOTIFICATION_OPTIONS, fakeLatencyMs: 0 };
const msg = { subject: 'Hi', body: 'Hello' };

describe('Fake channel senders', () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('each channel reads its own contact field from the user', () => {
    const user = {
      email: 'a@x.com',
      phone: null,
      deviceToken: 'tok-1',
    } as User;
    expect(new EmailChannelSender(options).recipientOf(user)).toBe('a@x.com');
    expect(new SmsChannelSender(options).recipientOf(user)).toBeNull();
    expect(new PushChannelSender(options).recipientOf(user)).toBe('tok-1');
  });

  it('succeeds with a provider id prefixed by the channel', async () => {
    const result = await new EmailChannelSender(options).send('a@x.com', msg);
    expect(result.providerId).toMatch(/^email_/);
  });

  it('"bounce" fails permanently, "fail" fails every time', async () => {
    const email = new EmailChannelSender(options);
    await expect(email.send('bounce@x.com', msg)).rejects.toBeInstanceOf(
      PermanentDeliveryError,
    );
    for (let i = 0; i < 3; i++) {
      const err = await email.send('fail@x.com', msg).catch((e) => e);
      expect(err).toBeInstanceOf(Error);
      expect(err).not.toBeInstanceOf(PermanentDeliveryError);
    }
  });

  it('"flaky" fails only the first call per recipient', async () => {
    const push = new PushChannelSender(options);
    await expect(push.send('flaky-1', msg)).rejects.toThrow('first call');
    await expect(push.send('flaky-1', msg)).resolves.toBeDefined();
    await expect(push.send('flaky-2', msg)).rejects.toThrow('first call');
  });

  it('random failures follow fakeFailRate', async () => {
    const sms = new SmsChannelSender({ ...options, fakeFailRate: 0.5 });
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.4).mockReturnValueOnce(0.6);
    await expect(sms.send('+919876543210', msg)).rejects.toThrow('random');
    await expect(sms.send('+919876543210', msg)).resolves.toBeDefined();
  });

  it('reads and clamps NOTIFY_FAIL_RATE', () => {
    expect(notificationOptionsFromEnv({}).fakeFailRate).toBe(0);
    expect(
      notificationOptionsFromEnv({ NOTIFY_FAIL_RATE: '0.3' }).fakeFailRate,
    ).toBe(0.3);
    expect(
      notificationOptionsFromEnv({ NOTIFY_FAIL_RATE: '7' }).fakeFailRate,
    ).toBe(1);
    expect(
      notificationOptionsFromEnv({ NOTIFY_FAIL_RATE: 'abc' }).fakeFailRate,
    ).toBe(0);
  });
});

describe('ChannelFactory', () => {
  it('is wired by Nest with a sender for every channel', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [CommonModule, NotificationsModule],
    }).compile();
    const factory = moduleRef.get(ChannelFactory);
    expect(factory.get(NotificationChannel.SMS)).toBeInstanceOf(
      SmsChannelSender,
    );
    expect(factory.get(NotificationChannel.PUSH).channel).toBe('PUSH');
  });

  it('fails at boot on a duplicate or a missing channel', () => {
    const email = new EmailChannelSender(options);
    const sms = new SmsChannelSender(options);
    expect(() => new ChannelFactory([email, email])).toThrow(
      "Duplicate sender for channel 'EMAIL'",
    );
    expect(() => new ChannelFactory([email, sms])).toThrow(
      'No sender for channel(s): PUSH',
    );
  });
});
