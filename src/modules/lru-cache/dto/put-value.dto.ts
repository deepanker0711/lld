import { IsDefined, IsInt, IsOptional, Min } from 'class-validator';

export class PutValueDto {
  /** Any JSON value: string, number, object, array. */
  @IsDefined()
  value: unknown;

  /** Overrides the cache's defaultTtlMs for this key. */
  @IsOptional()
  @IsInt()
  @Min(1)
  ttlMs?: number;
}
