import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { SeatType } from '../domain/seat';

export class SeatRowDto {
  @Matches(/^[A-Z]{1,2}$/, { message: 'row must be 1-2 capital letters' })
  row: string;

  @IsInt()
  @Min(1)
  @Max(50)
  seats: number;

  @IsEnum(SeatType)
  type: SeatType;
}

export class ScreenDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => SeatRowDto)
  rows: SeatRowDto[];
}

export class CreateCinemaDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  city: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ScreenDto)
  screens: ScreenDto[];
}

export class CreateMovieDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @IsInt()
  @Min(30)
  @Max(300)
  durationMin: number;

  @IsString()
  @IsNotEmpty()
  language: string;
}

export class SeatPricesDto {
  @IsOptional() @IsInt() @Min(1) REGULAR?: number;
  @IsOptional() @IsInt() @Min(1) PREMIUM?: number;
  @IsOptional() @IsInt() @Min(1) RECLINER?: number;
}

export class CreateShowDto {
  @IsString() @IsNotEmpty() movieId: string;
  @IsString() @IsNotEmpty() screenId: string;

  @IsISO8601({ strict: true })
  startsAt: string;

  /** Paise per seat type; every type present on the screen needs a price. */
  @ValidateNested()
  @Type(() => SeatPricesDto)
  prices: SeatPricesDto;
}

export class ShowsQuery {
  @IsOptional() @IsString() movieId?: string;
  @IsOptional() @IsString() city?: string;
}

export class HoldSeatsDto {
  /** From the auth token in a real app. */
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @Matches(/^[A-Z]{1,2}\d{1,2}$/, { each: true, message: 'each seat must look like A7' })
  seats: string[];
}

export class ConfirmBookingDto {
  @IsString() @IsNotEmpty() userId: string;
  /** "tok_decline" simulates a declined card. */
  @IsString() @IsNotEmpty() paymentToken: string;
}

export class CancelBookingDto {
  @IsString() @IsNotEmpty() userId: string;
}
