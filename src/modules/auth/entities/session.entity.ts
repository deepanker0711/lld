import { BaseEntity } from '../../../common/entities/base.entity';

export type RevokeReason = 'LOGOUT' | 'LOGOUT_ALL' | 'REVOKED_BY_USER' | 'REFRESH_TOKEN_REUSE';

/**
 * One login on one device. The refresh token rotates on every use; the session
 * (and its id inside access tokens) stays the same until it is revoked or expires.
 */
export class Session extends BaseEntity {
  userId: string;
  /** SHA-256 of the only refresh token that is valid right now. */
  refreshTokenHash: string;
  userAgent: string | null;
  ip: string | null;
  lastUsedAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  revokeReason: RevokeReason | null;
}
