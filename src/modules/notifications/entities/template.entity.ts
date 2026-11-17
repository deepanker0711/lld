import { BaseEntity } from '../../../common/entities/base.entity';
import { NotificationChannel } from '../domain/notification-channel';

/**
 * One template key can have a variant per channel plus a default (channel = null):
 *   leave_approved / EMAIL   → long body with subject
 *   leave_approved / SMS     → 160-char version
 *   leave_approved / default → used by any channel without its own variant
 *
 * id = "key:CHANNEL" or "key:DEFAULT", so lookup is a direct Map get.
 */
export class Template extends BaseEntity {
  key: string;
  channel: NotificationChannel | null;
  subject: string | null;
  body: string;
  /** Extracted from subject + body at creation. Used to reject sends with missing data. */
  variables: string[];
}

export function templateId(
  key: string,
  channel: NotificationChannel | null,
): string {
  return `${key}:${channel ?? 'DEFAULT'}`;
}
