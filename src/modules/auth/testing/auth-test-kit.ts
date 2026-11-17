import { FakeClock } from '../../../common/utils/clock';
import { KeyedMutex } from '../../../common/utils/keyed-mutex';
import { AuthService } from '../auth.service';
import { DEFAULT_AUTH_OPTIONS } from '../domain/auth-options';
import { ScryptPasswordHasher } from '../domain/password-hasher';
import { SessionRepository } from '../session.repository';
import { UserRepository } from '../user.repository';

export const NOW = Date.parse('2026-11-09T04:30:00.000Z');
export const MINUTE = 60_000;

export function createAuthKit() {
  const clock = new FakeClock(NOW);
  const options = { ...DEFAULT_AUTH_OPTIONS, scryptCost: 1024 };
  const users = new UserRepository();
  const sessions = new SessionRepository();
  const service = new AuthService(
    users,
    sessions,
    new ScryptPasswordHasher(options.scryptCost),
    options,
    clock,
    new KeyedMutex(),
  );
  return { clock, options, users, sessions, service };
}
