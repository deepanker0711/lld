import { BaseEntity } from '../../../common/entities/base.entity';
import { Role } from '../domain/role';

export class User extends BaseEntity {
  /** Lower-cased; unique. */
  email: string;
  name: string;
  passwordHash: string;
  roles: Role[];
  /** Consecutive failures; reset on success or when a lockout starts. */
  failedLoginAttempts: number;
  lockedUntil: Date | null;
  lastLoginAt: Date | null;
}

export type PublicUser = Omit<User, 'passwordHash' | 'failedLoginAttempts' | 'lockedUntil'>;

export function toPublicUser(u: User): PublicUser {
  const { passwordHash: _h, failedLoginAttempts: _f, lockedUntil: _l, ...rest } = u;
  return rest;
}
