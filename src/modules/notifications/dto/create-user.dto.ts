import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  /** E.164: + then country code and number, e.g. +919876543210. */
  @IsOptional()
  @Matches(/^\+[1-9]\d{7,14}$/, {
    message: 'phone must be E.164, e.g. +919876543210',
  })
  phone?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  deviceToken?: string;
}
