import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDefined,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { RawValue } from '../../../common/validators/raw-value';

/** One optional boolean per channel. An unknown key like "FAX" is rejected by forbidNonWhitelisted. */
export class ChannelTogglesDto {
  @IsOptional() @RawValue() @IsBoolean() EMAIL?: boolean;
  @IsOptional() @RawValue() @IsBoolean() SMS?: boolean;
  @IsOptional() @RawValue() @IsBoolean() PUSH?: boolean;
}

/** Partial update: channels not mentioned keep their current setting. */
export class UpdatePreferencesDto {
  @IsDefined()
  @ValidateNested()
  @Type(() => ChannelTogglesDto)
  channels: ChannelTogglesDto;
}
