import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { NotificationChannel } from '../domain/notification-channel';

export class CreateTemplateDto {
  @Matches(/^[a-z0-9_]{2,50}$/, {
    message: 'key must be 2-50 chars: lowercase letters, digits, _',
  })
  key: string;

  /** Omit for the default variant used by channels without their own. */
  @IsOptional()
  @IsEnum(NotificationChannel)
  channel?: NotificationChannel;

  /** Required for the EMAIL variant; optional otherwise (push uses it as the title). */
  @ValidateIf(
    (o: CreateTemplateDto) =>
      o.channel === NotificationChannel.EMAIL || o.subject !== undefined,
  )
  @IsString()
  @IsNotEmpty({ message: 'subject is required for EMAIL templates' })
  @MaxLength(200)
  subject?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  body: string;
}
