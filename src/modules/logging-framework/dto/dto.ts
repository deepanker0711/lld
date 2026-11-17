import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsNotEmpty, IsObject, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { RawValue } from '../../../common/validators/raw-value';
import { LEVEL_NAMES, type LevelName } from '../domain/log-level';

const LOGGER_NAME = /^[a-z0-9_-]+(\.[a-z0-9_-]+)*$/i;

export class SetLevelDto {
  /** null = inherit from the parent logger again. */
  @ValidateIf((_, v) => v !== null)
  @IsIn(LEVEL_NAMES)
  level: LevelName | null;
}

export class WriteLogDto {
  @Matches(LOGGER_NAME, { message: 'logger must be dotted words, e.g. app.orders' })
  logger: string;

  @IsIn(LEVEL_NAMES.filter((l) => l !== 'OFF'))
  level: Exclude<LevelName, 'OFF'>;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  message: string;

  @IsOptional()
  @IsObject()
  fields?: Record<string, unknown>;
}

export class EntriesQuery {
  @IsOptional() @IsIn(LEVEL_NAMES) level?: LevelName;
  @IsOptional() @Matches(LOGGER_NAME) logger?: string;
  @IsOptional() @IsString() contains?: string;
  @IsOptional() @IsString() requestId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) limit: number = 50;
}

export class DemoCheckoutDto {
  @IsOptional() @RawValue() @IsBoolean() fail?: boolean;
}
