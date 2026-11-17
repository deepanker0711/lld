import {
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { IsMutuallyExclusiveWith } from '../../../common/validators/is-mutually-exclusive-with';

const SECOND = 1000;
const DAY = 24 * 60 * 60 * SECOND;

export class CreateJobDto {
  /** Handler name, e.g. SEND_EMAIL. Unknown types are rejected by the service (needs the registry). */
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  type: string;

  /** Free-form data passed to the handler. */
  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;

  /** Absolute time (ISO 8601). "In the past" is checked in the service, which has the Clock. */
  @IsOptional()
  @IsISO8601(
    {},
    { message: 'runAt must be an ISO 8601 date, e.g. 2026-11-02T10:00:00Z' },
  )
  runAt?: string;

  /** Relative delay from now. Omit both runAt and delayMs to run as soon as possible. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(7 * DAY)
  @IsMutuallyExclusiveWith('runAt', {
    message: 'Provide either runAt or delayMs, not both',
  })
  delayMs?: number;

  /** Makes the job recurring: next run = previous scheduled run + intervalMs. */
  @IsOptional()
  @IsInt()
  @Min(SECOND)
  @Max(DAY)
  intervalMs?: number;

  /** 0-10, higher runs first when several jobs are due. Default 0. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  priority?: number;

  /** Total tries before FAILED (1 = no retries). Default 3. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  maxAttempts?: number;
}
