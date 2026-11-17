import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { UnauthorizedError } from '../../../common/errors/domain.errors';
import { Role } from './role';

export interface AccessClaims {
  sub: string; // user id
  sid: string; // session id: lets logout revoke a token before it expires
  roles: Role[];
  iss: string;
  iat: number; // seconds
  exp: number; // seconds
}

const b64url = (buf: Buffer | string) => Buffer.from(buf).toString('base64url');

/**
 * Minimal HS256 JWT so the mechanics are visible (use @nestjs/jwt or jose in production).
 * Pure: secret, issuer and time are passed in; no Nest, no clock reads.
 */
export class JwtCodec {
  constructor(
    private readonly secret: string,
    private readonly issuer: string,
  ) {}

  sign(claims: Omit<AccessClaims, 'iss'>): string {
    const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payload = b64url(JSON.stringify({ ...claims, iss: this.issuer }));
    return `${header}.${payload}.${this.signature(`${header}.${payload}`)}`;
  }

  verify(token: string, nowMs: number): AccessClaims {
    const parts = token.split('.');
    if (parts.length !== 3) throw new UnauthorizedError('Malformed token');
    const [header, payload, sig] = parts;

    // Pin the algorithm: never let the token's own header choose it ("alg": "none" attack).
    const head = this.parse<{ alg?: string }>(header);
    if (head.alg !== 'HS256') throw new UnauthorizedError('Unsupported token algorithm');

    const expected = Buffer.from(this.signature(`${header}.${payload}`));
    const actual = Buffer.from(sig);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      throw new UnauthorizedError('Invalid token signature');
    }

    const claims = this.parse<AccessClaims>(payload);
    if (claims.iss !== this.issuer) throw new UnauthorizedError('Invalid token issuer');
    if (claims.exp * 1000 <= nowMs) throw new UnauthorizedError('Access token expired');
    return claims;
  }

  private signature(input: string): string {
    return createHmac('sha256', this.secret).update(input).digest('base64url');
  }

  private parse<T>(part: string): T {
    try {
      return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as T;
    } catch {
      throw new UnauthorizedError('Malformed token');
    }
  }
}

/** Refresh tokens are opaque random strings; only their SHA-256 is stored. */
export function newRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
