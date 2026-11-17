import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

/** Strategy: swap scrypt for argon2/bcrypt without touching the auth service. */
export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, stored: string): Promise<boolean>;
}

export const PASSWORD_HASHER = Symbol('PASSWORD_HASHER');

function scryptAsync(password: string, salt: Buffer, cost: number): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, 32, { N: cost, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (err, key) =>
      err ? reject(err) : resolve(key),
    ),
  );
}

/**
 * Stored format: scrypt$<N>$<salt b64>$<hash b64>.
 * The cost is stored with the hash, so raising it later still verifies old passwords
 * (and you can re-hash them on the next successful login).
 */
export class ScryptPasswordHasher implements PasswordHasher {
  constructor(private readonly cost = 16384) {}

  async hash(password: string): Promise<string> {
    const salt = randomBytes(16);
    const key = await scryptAsync(password, salt, this.cost);
    return `scrypt$${this.cost}$${salt.toString('base64')}$${key.toString('base64')}`;
  }

  async verify(password: string, stored: string): Promise<boolean> {
    const [scheme, n, salt, hash] = stored.split('$');
    if (scheme !== 'scrypt' || !n || !salt || !hash) return false;
    const expected = Buffer.from(hash, 'base64');
    const actual = await scryptAsync(password, Buffer.from(salt, 'base64'), Number(n));
    // Constant-time compare: a normal === leaks how many leading bytes matched.
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }
}
