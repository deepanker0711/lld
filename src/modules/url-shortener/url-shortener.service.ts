import { Inject, Injectable } from '@nestjs/common';
import { BadRequestError, ConflictError, GoneError, NotFoundError } from '../../common/errors/domain.errors';
import { Clock } from '../../common/utils/clock';
import { CODE_GENERATOR, type CodeGenerator } from './domain/code-generator';
import { CreateShortUrlDto } from './dto/create-short-url.dto';
import { ShortUrl } from './entities/short-url.entity';
import { ShortUrlRepository } from './short-url.repository';

/** First path segments used by other routes; a code equal to one would be unreachable. */
export const RESERVED_CODES = new Set(['urls', 'docs', 'docs-json', 'health', 'caches', 'rate-limits', 'limited', 'jobs', 'scheduler', 'users', 'templates', 'notifications', 'parking-lots', 'tickets', 'employees', 'leaves', 'managers', 'auth', 'products', 'coupons', 'carts', 'orders', 'cinemas', 'movies', 'shows', 'bookings', 'wallets', 'wallet-transactions', 'splitwise', 'restaurants', 'delivery-agents', 'food-orders', 'logging']);

const MAX_GENERATION_ATTEMPTS = 10;

export interface ShortUrlView {
  code: string;
  shortUrl: string;
  longUrl: string;
  isCustom: boolean;
  expiresAt: string | null;
  createdAt: string;
}

export interface ShortUrlStats extends ShortUrlView {
  clicks: number;
  lastAccessedAt: string | null;
  expired: boolean;
}

@Injectable()
export class UrlShortenerService {
  constructor(
    private readonly urls: ShortUrlRepository,
    @Inject(CODE_GENERATOR) private readonly generator: CodeGenerator,
    private readonly clock: Clock,
  ) {}

  /** Returns the link and whether it was newly created (false = deduped). */
  create(dto: CreateShortUrlDto, baseUrl: string): { url: ShortUrlView; created: boolean } {
    const longUrl = new URL(dto.longUrl).toString(); // normalize: lowercases host, adds trailing '/'

    // Dedupe only plain requests: no alias, no expiry.
    if (!dto.alias && !dto.ttlSeconds) {
      const existing = this.urls.findReusable(longUrl);
      if (existing) return { url: this.toView(existing, baseUrl), created: false };
    }

    const code = dto.alias ? this.claimAlias(dto.alias) : this.generateFreeCode();
    const entity = this.urls.create({
      code,
      longUrl,
      isCustom: !!dto.alias,
      expiresAt: dto.ttlSeconds ? new Date(this.clock.now() + dto.ttlSeconds * 1000) : null,
      clicks: 0,
      lastAccessedAt: null,
    });
    return { url: this.toView(entity, baseUrl), created: true };
  }

  /** Redirect target. Counts the click. */
  resolve(code: string): string {
    const entity = this.getOrThrow(code);
    if (this.isExpired(entity)) throw new GoneError(`Short URL '${code}' has expired`);
    // Synchronous read-modify-write: no await in between, so concurrent requests can't lose a click.
    entity.clicks++;
    entity.lastAccessedAt = this.clock.date();
    return entity.longUrl;
  }

  stats(code: string, baseUrl: string): ShortUrlStats {
    const entity = this.getOrThrow(code);
    return {
      ...this.toView(entity, baseUrl),
      clicks: entity.clicks,
      lastAccessedAt: entity.lastAccessedAt?.toISOString() ?? null,
      expired: this.isExpired(entity),
    };
  }

  remove(code: string): { deleted: string } {
    this.getOrThrow(code);
    this.urls.delete(code);
    return { deleted: code };
  }

  private claimAlias(alias: string): string {
    if (RESERVED_CODES.has(alias.toLowerCase())) throw new BadRequestError(`Alias '${alias}' is reserved`);
    // Expired aliases stay taken: old links in emails must never start pointing somewhere else.
    if (this.urls.exists(alias)) throw new ConflictError(`Alias '${alias}' is already taken`);
    return alias;
  }

  /** A generated code can clash with an earlier custom alias or a reserved word, so skip those. */
  private generateFreeCode(): string {
    for (let i = 0; i < MAX_GENERATION_ATTEMPTS; i++) {
      const code = this.generator.next();
      if (!this.urls.exists(code) && !RESERVED_CODES.has(code.toLowerCase())) return code;
    }
    throw new Error('Could not generate a free short code');
  }

  private getOrThrow(code: string): ShortUrl {
    const entity = this.urls.findByCode(code);
    if (!entity) throw new NotFoundError('Short URL', code);
    return entity;
  }

  private isExpired(entity: ShortUrl): boolean {
    return entity.expiresAt !== null && entity.expiresAt.getTime() <= this.clock.now();
  }

  private toView(entity: ShortUrl, baseUrl: string): ShortUrlView {
    return {
      code: entity.code,
      shortUrl: `${baseUrl}/${entity.code}`,
      longUrl: entity.longUrl,
      isCustom: entity.isCustom,
      expiresAt: entity.expiresAt?.toISOString() ?? null,
      createdAt: entity.createdAt.toISOString(),
    };
  }
}
