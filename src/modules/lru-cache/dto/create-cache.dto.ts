import { IsEnum, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { EvictionPolicyType } from '../domain/eviction-policy.interface';

export class CreateCacheDto {
  /** Unique cache name, used in URLs. */
  @IsString()
  @MaxLength(50)
  @Matches(/^[a-zA-Z0-9_-]+$/, { message: 'name may contain only letters, digits, _ and -' })
  name: string;

  /** Max number of keys before eviction kicks in. */
  @IsInt()
  @Min(1)
  @Max(10_000)
  capacity: number;

  /** TTL applied to keys put without their own ttlMs. Omit for no expiry. */
  @IsOptional()
  @IsInt()
  @Min(1)
  defaultTtlMs?: number;

  @IsOptional()
  @IsEnum(EvictionPolicyType)
  policy?: EvictionPolicyType = EvictionPolicyType.LRU;
}
