import { BaseEntity } from '../../../common/entities/base.entity';
import { NotificationChannel } from '../domain/notification-channel';

export type ChannelPreferences = Record<NotificationChannel, boolean>;

/**
 * Contact details are all optional: a user without a phone can still get email.
 * Preferences are opt-out: every channel starts enabled.
 * (In SQL, preferences would be their own table: user_id, channel, enabled.)
 */
export class User extends BaseEntity {
  name: string;
  email: string | null;
  phone: string | null;
  deviceToken: string | null;
  preferences: ChannelPreferences;
}
