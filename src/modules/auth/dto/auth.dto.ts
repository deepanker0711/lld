import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const lowerTrim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class RegisterDto {
  @Transform(lowerTrim)
  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  /** 8–72 chars with a letter and a digit. 72 = bcrypt's limit; keep it if you ever switch. */
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  @Matches(/(?=.*[A-Za-z])(?=.*\d)/, { message: 'password must contain a letter and a digit' })
  password: string;
}

export class LoginDto {
  @Transform(lowerTrim)
  @IsEmail()
  email: string;

  /** No strength rules here: old passwords must still be able to log in. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(72)
  password: string;
}

export class RefreshDto {
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}
