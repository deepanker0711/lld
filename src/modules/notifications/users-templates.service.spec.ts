import {
  ConflictError,
  NotFoundError,
} from '../../common/errors/domain.errors';
import { NotificationChannel } from './domain/notification-channel';
import { TemplateRepository } from './template.repository';
import { TemplatesService } from './templates.service';
import { UserRepository } from './user.repository';
import { UsersService } from './users.service';

const { EMAIL, SMS, PUSH } = NotificationChannel;

describe('UsersService', () => {
  const setup = () => new UsersService(new UserRepository());

  it('creates a user with null contacts and every channel enabled', () => {
    const user = setup().create({ name: 'Asha', email: 'asha@x.com' });
    expect(user).toMatchObject({
      name: 'Asha',
      email: 'asha@x.com',
      phone: null,
      deviceToken: null,
      preferences: { EMAIL: true, SMS: true, PUSH: true },
    });
    expect(user.id).toMatch(/^usr_/);
  });

  it('merges preference updates instead of replacing them', () => {
    const service = setup();
    const user = service.create({ name: 'Asha' });
    service.updatePreferences(user.id, { channels: { SMS: false } });
    service.updatePreferences(user.id, { channels: { PUSH: false } });
    expect(service.get(user.id).preferences).toEqual({
      EMAIL: true,
      SMS: false,
      PUSH: false,
    });
  });

  it('404s for an unknown user', () => {
    expect(() => setup().updatePreferences('usr_x', { channels: {} })).toThrow(
      NotFoundError,
    );
  });
});

describe('TemplatesService', () => {
  const setup = () => new TemplatesService(new TemplateRepository());

  it('stores variables from subject and body', () => {
    const t = setup().create({
      key: 'leave_approved',
      channel: EMAIL,
      subject: 'Leave from {{from}}',
      body: 'Hi {{name}}, approved from {{from}} to {{to}}',
    });
    expect(t).toMatchObject({
      id: 'leave_approved:EMAIL',
      channel: EMAIL,
      variables: ['from', 'name', 'to'],
    });
  });

  it('rejects a second variant for the same key + channel, allows other channels and a default', () => {
    const service = setup();
    service.create({ key: 'otp', channel: SMS, body: 'Code {{code}}' });
    expect(() =>
      service.create({ key: 'otp', channel: SMS, body: 'x' }),
    ).toThrow(ConflictError);
    service.create({
      key: 'otp',
      channel: EMAIL,
      subject: 'OTP',
      body: 'Code {{code}}',
    });
    service.create({ key: 'otp', body: 'Your code is {{code}}' });
    expect(service.getByKey('otp').map((t) => t.id)).toEqual([
      'otp:SMS',
      'otp:EMAIL',
      'otp:DEFAULT',
    ]);
  });

  it('resolves the channel variant first, then the default, else undefined', () => {
    const service = setup();
    service.create({ key: 'welcome', channel: SMS, body: 'Hi {{name}}' });
    expect(service.resolve('welcome', SMS)?.id).toBe('welcome:SMS');
    expect(service.resolve('welcome', PUSH)).toBeUndefined();

    service.create({ key: 'welcome', body: 'Welcome {{name}}!' });
    expect(service.resolve('welcome', PUSH)?.id).toBe('welcome:DEFAULT');
    expect(service.resolve('welcome', SMS)?.id).toBe('welcome:SMS');
  });

  it('404s for a key with no variants', () => {
    expect(() => setup().getByKey('nope')).toThrow(NotFoundError);
  });
});
