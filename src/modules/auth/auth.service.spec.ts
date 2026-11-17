import { Role } from './domain/role';
import { JwtCodec } from './domain/token.service';
import { createAuthKit, MINUTE } from './testing/auth-test-kit';

async function errorOf(fn: () => unknown) {
  try {
    await fn();
  } catch (e) {
    return e as { httpStatus: number; message: string; details?: unknown };
  }
  throw new Error('expected an error');
}

const asha = { email: 'asha@example.com', name: 'Asha', password: 'secret123' };

describe('AuthService', () => {
  let kit: ReturnType<typeof createAuthKit>;
  beforeEach(() => (kit = createAuthKit()));

  describe('register', () => {
    it('stores a salted hash, never the password, and hides it from the response', async () => {
      const user = await kit.service.register(asha);
      expect(user).not.toHaveProperty('passwordHash');
      const stored = kit.users.findByIdOrThrow(user.id);
      expect(stored.passwordHash).toMatch(/^scrypt\$1024\$/);
      expect(stored.passwordHash).not.toContain('secret123');
      expect(user.roles).toEqual([Role.USER]);
    });

    it('409 on a duplicate email, even when two registrations race', async () => {
      const results = await Promise.allSettled([kit.service.register(asha), kit.service.register(asha)]);
      expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
      expect(kit.users.count()).toBe(1);
    });

    it('admin emails get ADMIN', async () => {
      const admin = await kit.service.register({ ...asha, email: 'admin@example.com' });
      expect(admin.roles).toEqual([Role.USER, Role.ADMIN]);
    });
  });

  describe('login', () => {
    beforeEach(() => kit.service.register(asha));

    it('returns an access token for the session and a refresh token', async () => {
      const pair = await kit.service.login(asha, { userAgent: 'curl' });
      expect(pair.expiresIn).toBe(15 * 60);
      const auth = kit.service.authenticate(pair.accessToken);
      expect(auth.sessionId).toBe(pair.sessionId);
      expect(kit.sessions.findByIdOrThrow(pair.sessionId).refreshTokenHash).not.toBe(pair.refreshToken);
    });

    it('same 401 for a wrong password and an unknown email', async () => {
      const wrong = await errorOf(() => kit.service.login({ ...asha, password: 'nope12345' }));
      const unknown = await errorOf(() => kit.service.login({ ...asha, email: 'who@example.com' }));
      expect(wrong).toMatchObject({ httpStatus: 401, message: 'Invalid email or password' });
      expect(unknown).toMatchObject({ httpStatus: 401, message: 'Invalid email or password' });
    });

    it('locks after 5 failures, even when they arrive in parallel; unlocks after 15 minutes', async () => {
      const bad = { ...asha, password: 'wrong1234' };
      await Promise.allSettled(Array.from({ length: 6 }, () => kit.service.login(bad)));
      expect(await errorOf(() => kit.service.login(asha))).toMatchObject({ httpStatus: 429 });

      kit.clock.advance(15 * MINUTE);
      await expect(kit.service.login(asha)).resolves.toHaveProperty('accessToken');
    });
  });

  describe('tokens', () => {
    beforeEach(() => kit.service.register(asha));

    it('access token expires after 15 minutes', async () => {
      const { accessToken } = await kit.service.login(asha);
      kit.clock.advance(15 * MINUTE);
      expect(await errorOf(() => kit.service.authenticate(accessToken))).toMatchObject({
        httpStatus: 401,
        message: 'Access token expired',
      });
    });

    it('rejects a tampered token and alg=none', async () => {
      const { accessToken } = await kit.service.login(asha);
      const [h, p] = accessToken.split('.');
      const claims = JSON.parse(Buffer.from(p, 'base64url').toString());
      const forged = Buffer.from(JSON.stringify({ ...claims, roles: ['ADMIN'] })).toString('base64url');
      expect(await errorOf(() => kit.service.authenticate(`${h}.${forged}.${accessToken.split('.')[2]}`))).toMatchObject({
        message: 'Invalid token signature',
      });
      const none = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url');
      expect(await errorOf(() => kit.service.authenticate(`${none}.${p}.`))).toMatchObject({
        message: 'Unsupported token algorithm',
      });
    });

    it('refresh rotates; using the old refresh token again revokes the session', async () => {
      const first = await kit.service.login(asha);
      const second = kit.service.refresh(first.refreshToken);
      expect(second.refreshToken).not.toBe(first.refreshToken);
      expect(second.sessionId).toBe(first.sessionId);

      expect(await errorOf(() => kit.service.refresh(first.refreshToken))).toMatchObject({
        httpStatus: 401,
        message: 'Refresh token reuse detected; session revoked',
      });
      // The thief's copy and the real user's newest token are both dead now.
      expect(await errorOf(() => kit.service.refresh(second.refreshToken))).toMatchObject({ httpStatus: 401 });
      expect(await errorOf(() => kit.service.authenticate(second.accessToken))).toMatchObject({ httpStatus: 401 });
    });

    it('logout makes the access token fail immediately; other devices keep working', async () => {
      const laptop = await kit.service.login(asha);
      const phone = await kit.service.login(asha);
      kit.service.logout(kit.service.authenticate(laptop.accessToken));

      expect(await errorOf(() => kit.service.authenticate(laptop.accessToken))).toMatchObject({
        message: 'Session is no longer active',
      });
      expect(kit.service.listSessions(kit.service.authenticate(phone.accessToken))).toHaveLength(1);
    });

    it('logout-all revokes every session; revoking another user’s session is 404', async () => {
      const a = await kit.service.login(asha);
      await kit.service.login(asha);
      const auth = kit.service.authenticate(a.accessToken);

      await kit.service.register({ ...asha, email: 'ravi@example.com' });
      const ravi = await kit.service.login({ ...asha, email: 'ravi@example.com' });
      expect(await errorOf(() => kit.service.revokeSession(auth, ravi.sessionId))).toMatchObject({ httpStatus: 404 });

      expect(kit.service.logoutAll(auth)).toEqual({ revoked: 2 });
    });

    it('a token signed with another secret is rejected', async () => {
      const user = kit.users.findByEmail(asha.email)!;
      const other = new JwtCodec('other-secret', kit.options.issuer);
      const t = other.sign({ sub: user.id, sid: 'x', roles: [Role.ADMIN], iat: 0, exp: 9_999_999_999 });
      expect(await errorOf(() => kit.service.authenticate(t))).toMatchObject({ httpStatus: 401 });
    });
  });
});
