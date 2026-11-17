import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';
import { NotificationChannel } from '../domain/notification-channel';

export class SendNotificationDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsNotEmpty()
  templateKey: string;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsEnum(NotificationChannel, { each: true })
  channels: NotificationChannel[];

  /** Values for the template's {{placeholders}}. Checked against the template in the service. */
  @IsOptional()
  @IsObject()
  data: Record<string, unknown> = {};
}
