import {
  IsDateString,
  isDateString,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
} from 'class-validator';

export class CreateJobDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  type: string;

  @IsOptional()
  @IsObject()
  payload: Record<string, unknown>;

  @IsOptional()
  @IsDateString()
  runAt?: Date | null;
}
