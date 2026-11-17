import { Inject, Injectable } from '@nestjs/common';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  TooManyRequestsError,
  UnauthorizedError,
} from '../../common/errors/domain.errors';
import { Clock } from '../../common/utils/clock';
import { KeyedMutex } from '../../common/utils/keyed-mutex';
import { AUTH_OPTIONS, type AuthOptions } from './domain/auth-options';
import { PASSWORD_HASHER, type PasswordHasher } from './domain/password-hasher';
import { Role } from './domain/role';
import { type AccessClaims, JwtCodec, newRefreshToken, sha256 } from './domain/token.service';
import { LoginDto, RegisterDto } from './dto/auth.dto';
import { RevokeReason, Session } from './entities/session.entity';
import { PublicUser, toPublicUser } from './entities/user.entity';
import { SessionRepository } from './session.repository';
import { UserRepository } from './user.repository';

export interface TokenPair {
  tokenType: 'Bearer';
  accessToken: string;
  /** Seconds until the access token expires. */
  expiresIn: number;
  refreshToken: string;
  sessionId: string;
}

export interface RequestMeta {
  userAgent?: string;
  ip?: string;
}

export type SessionView = Pick<
  Session,
  'id' | 'userAgent' | 'ip' | 'createdAt' | 'lastUsedAt' | 'expiresAt'
> & { current: boolean };

/** What the guard attaches to the request. */
export interface AuthContext {
  userId: string;
  sessionId: string;
  roles: Role[];
}

@Injectable()
export class AuthService {
  private readonly jwt: JwtCodec;
  /** Verified against when the email is unknown, so both paths take the same time. */
  private dummyHash: Promise<string>;

  constructor(
    private readonly users: UserRepository,
    private readonly sessions: SessionRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(AUTH_OPTIONS) private readonly options: AuthOptions,
    private readonly clock: Clock,
    private readonly mutex: KeyedMutex,
  ) {
    this.jwt = new JwtCodec(options.jwtSecret, options.issuer);
    this.dummyHash = hasher.hash('not-a-real-password-1');
  }

  // ── Register ─────────────────────────────────────────────────────────

  /**
   * Hashing is async, so without the lock two registrations for the same email
   * could both pass the "taken?" check before either is stored.
   */
  register(dto: RegisterDto): Promise<PublicUser> {
    return this.mutex.runExclusive(`email:${dto.email}`, async () => {
      if (this.users.findByEmail(dto.email)) {
        throw new ConflictError(`An account with email '${dto.email}' already exists`);
      }
      const passwordHash = await this.hasher.hash(dto.password);
      const user = this.users.create({
        email: dto.email,
        name: dto.name,
        passwordHash,
        roles: this.options.adminEmails.includes(dto.email) ? [Role.USER, Role.ADMIN] : [Role.USER],
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: null,
      });
      return toPublicUser(user);
    });
  }

  // ── Login ────────────────────────────────────────────────────────────

  /**
   * Locked per email: without it, 100 parallel guesses would all pass the lockout
   * check before the first failure is counted, and the lockout would never trigger.
   */
  login(dto: LoginDto, meta: RequestMeta = {}): Promise<TokenPair> {
    return this.mutex.runExclusive(`email:${dto.email}`, async () => {
      const user = this.users.findByEmail(dto.email);
      const now = this.clock.now();

      if (user?.lockedUntil && user.lockedUntil.getTime() > now) {
        const retryAfterMs = user.lockedUntil.getTime() - now;
        throw new TooManyRequestsError('Too many failed attempts; try again later', { retryAfterMs });
      }

      const ok = await this.hasher.verify(dto.password, user?.passwordHash ?? (await this.dummyHash));
      if (!user || !ok) {
        if (user) this.recordFailure(user.id);
        // Same message for "no such email" and "wrong password": no account enumeration.
        throw new UnauthorizedError('Invalid email or password');
      }

      this.users.update(user.id, {
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: this.clock.date(),
      });
      return this.startSession(user.id, meta);
    });
  }

  private recordFailure(userId: string): void {
    const user = this.users.findByIdOrThrow(userId);
    const attempts = user.failedLoginAttempts + 1;
    if (attempts >= this.options.maxFailedAttempts) {
      this.users.update(userId, {
        failedLoginAttempts: 0,
        lockedUntil: new Date(this.clock.now() + this.options.lockoutMs),
      });
    } else {
      this.users.update(userId, { failedLoginAttempts: attempts });
    }
  }

  private startSession(userId: string, meta: RequestMeta): TokenPair {
    const refreshToken = newRefreshToken();
    const session = this.sessions.create({
      userId,
      refreshTokenHash: sha256(refreshToken),
      userAgent: meta.userAgent ?? null,
      ip: meta.ip ?? null,
      lastUsedAt: this.clock.date(),
      expiresAt: new Date(this.clock.now() + this.options.sessionTtlMs),
      revokedAt: null,
      revokeReason: null,
    });
    return this.issue(session, refreshToken);
  }

  // ── Refresh (rotation + reuse detection) ─────────────────────────────

  /**
   * Synchronous, so two refreshes with the same token can't both rotate: the first
   * wins, the second presents an already-rotated token and is treated as reuse.
   */
  refresh(refreshToken: string): TokenPair {
    const hash = sha256(refreshToken);
    const session = this.sessions.findByTokenHash(hash);
    if (!session) throw new UnauthorizedError('Invalid refresh token');
    if (session.revokedAt) throw new UnauthorizedError('Session has been revoked');

    if (session.refreshTokenHash !== hash) {
      // An old token came back: someone has a copy. Kill the session for everyone.
      this.revoke(session, 'REFRESH_TOKEN_REUSE');
      throw new UnauthorizedError('Refresh token reuse detected; session revoked');
    }
    if (session.expiresAt.getTime() <= this.clock.now()) {
      throw new UnauthorizedError('Session expired; log in again');
    }

    const next = newRefreshToken();
    const updated = this.sessions.update(session.id, {
      refreshTokenHash: sha256(next),
      lastUsedAt: this.clock.date(),
    });
    return this.issue(updated, next);
  }

  private issue(session: Session, refreshToken: string): TokenPair {
    const user = this.users.findByIdOrThrow(session.userId);
    const iat = Math.floor(this.clock.now() / 1000);
    const ttl = Math.floor(this.options.accessTokenTtlMs / 1000);
    return {
      tokenType: 'Bearer',
      accessToken: this.jwt.sign({ sub: user.id, sid: session.id, roles: user.roles, iat, exp: iat + ttl }),
      expiresIn: ttl,
      refreshToken,
      sessionId: session.id,
    };
  }

  // ── Access-token check (used by the guard) ───────────────────────────

  /**
   * Signature + expiry, then the session: a stateless check alone would keep a
   * logged-out token working until it expires. In-memory lookup, so it's cheap here;
   * at scale this becomes a Redis "revoked session ids" set.
   */
  authenticate(accessToken: string): AuthContext {
    const claims: AccessClaims = this.jwt.verify(accessToken, this.clock.now());
    const session = this.sessions.findById(claims.sid);
    if (!session || session.revokedAt || session.userId !== claims.sub) {
      throw new UnauthorizedError('Session is no longer active');
    }
    return { userId: claims.sub, sessionId: claims.sid, roles: claims.roles };
  }

  // ── Logout / sessions ────────────────────────────────────────────────

  logout(auth: AuthContext): void {
    this.revoke(this.sessions.findByIdOrThrow(auth.sessionId), 'LOGOUT');
  }

  logoutAll(auth: AuthContext): { revoked: number } {
    const active = this.sessions.findByUser(auth.userId).filter((s) => !s.revokedAt);
    active.forEach((s) => this.revoke(s, 'LOGOUT_ALL'));
    return { revoked: active.length };
  }

  me(auth: AuthContext): PublicUser {
    return toPublicUser(this.users.findByIdOrThrow(auth.userId));
  }

  listSessions(auth: AuthContext): SessionView[] {
    const now = this.clock.now();
    return this.sessions
      .findByUser(auth.userId)
      .filter((s) => !s.revokedAt && s.expiresAt.getTime() > now)
      .map((s) => ({
        id: s.id,
        userAgent: s.userAgent,
        ip: s.ip,
        createdAt: s.createdAt,
        lastUsedAt: s.lastUsedAt,
        expiresAt: s.expiresAt,
        current: s.id === auth.sessionId,
      }));
  }

  /** "Log out that other device". Someone else's session id is 404, not 403. */
  revokeSession(auth: AuthContext, sessionId: string): void {
    const session = this.sessions.findById(sessionId);
    if (!session || session.userId !== auth.userId) throw new NotFoundError('Session', sessionId);
    if (session.revokedAt) return; // idempotent
    this.revoke(session, 'REVOKED_BY_USER');
  }

  listUsers(): PublicUser[] {
    return this.users.findAll().map(toPublicUser);
  }

  /** Admin action: unlock an account and clear its counter. */
  unlock(userId: string): PublicUser {
    const user = this.users.findById(userId);
    if (!user) throw new NotFoundError('User', userId);
    return toPublicUser(this.users.update(userId, { failedLoginAttempts: 0, lockedUntil: null }));
  }

  assertRole(auth: AuthContext, role: Role): void {
    if (!auth.roles.includes(role)) throw new ForbiddenError(`Requires role ${role}`);
  }

  private revoke(session: Session, reason: RevokeReason): void {
    if (session.revokedAt) return;
    this.sessions.update(session.id, { revokedAt: this.clock.date(), revokeReason: reason });
  }
}
