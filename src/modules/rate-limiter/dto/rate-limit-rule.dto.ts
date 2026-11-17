import { OmitType, PartialType } from '@nestjs/swagger';
import { IsEnum, IsInt, Matches, Max, Min } from 'class-validator';
import { RateLimitAlgorithmType } from '../domain/rate-limit-algorithm';

export class CreateRuleDto {
  /** Name used in @RateLimit('<key>'). */
  @Matches(/^[a-z0-9-]{1,40}$/, { message: 'key must be 1-40 chars: lowercase letters, digits or -' })
  key: string;

  @IsEnum(RateLimitAlgorithmType)
  algorithm: RateLimitAlgorithmType;

  /** Requests allowed per window. */
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  limit: number;

  @IsInt()
  @Min(100)
  @Max(24 * 60 * 60 * 1000)
  windowMs: number;
}

export class UpdateRuleDto extends PartialType(OmitType(CreateRuleDto, ['key'] as const)) {}
