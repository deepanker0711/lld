import { Injectable } from '@nestjs/common';
import { InMemoryRepository } from '../../common/repository/in-memory.repository';
import { CreateInput } from '../../common/repository/repository.interface';
import { ShortUrl } from './entities/short-url.entity';

/**
 * Primary index: code -> ShortUrl (the base Map, since id === code).
 * Secondary index: longUrl -> code, for dedupe. Only generated, non-expiring
 * codes are indexed: a custom alias or a temporary link is never handed out
 * to someone else who shortens the same URL.
 * In SQL this is a UNIQUE index on code and a partial index on long_url.
 */
@Injectable()
export class ShortUrlRepository extends InMemoryRepository<ShortUrl> {
  private readonly codeByLongUrl = new Map<string, string>();

  constructor() {
    super('Short URL');
  }

  findByCode(code: string): ShortUrl | undefined {
    return this.findById(code);
  }

  findReusable(longUrl: string): ShortUrl | undefined {
    const code = this.codeByLongUrl.get(longUrl);
    return code ? this.findById(code) : undefined;
  }

  override create(data: CreateInput<ShortUrl>): ShortUrl {
    const entity = super.create({ ...data, id: data.code });
    if (!entity.isCustom && entity.expiresAt === null) this.codeByLongUrl.set(entity.longUrl, entity.code);
    return entity;
  }

  override delete(code: string): boolean {
    const entity = this.findById(code);
    if (entity && this.codeByLongUrl.get(entity.longUrl) === code) this.codeByLongUrl.delete(entity.longUrl);
    return super.delete(code);
  }
}
