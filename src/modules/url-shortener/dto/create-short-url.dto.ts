import { IsInt, IsOptional, IsUrl, Matches, Max, MaxLength, Min } from 'class-validator';

export class CreateShortUrlDto {
  /** The URL to redirect to. Must start with http:// or https://. */
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] }, { message: 'longUrl must be an http(s) URL' })
  @MaxLength(2048)
  longUrl: string;

  /** Custom code instead of a generated one. */
  @IsOptional()
  @Matches(/^[a-zA-Z0-9_-]{4,20}$/, { message: 'alias must be 4-20 chars: letters, digits, _ or -' })
  alias?: string;

  /** Link stops working after this many seconds. Omit for no expiry. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60 * 60 * 24 * 365)
  ttlSeconds?: number;
}
