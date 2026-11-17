import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateEmployeeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  /** Lower-cased so "A@K.com" and "a@k.com" are the same person. */
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  managerId?: string;
}
