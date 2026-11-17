import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/** Slot counts for one floor. Missing = 0. */
export class FloorDto {
  @IsOptional() @IsInt() @Min(0) @Max(500) bike: number = 0;
  @IsOptional() @IsInt() @Min(0) @Max(500) car: number = 0;
  @IsOptional() @IsInt() @Min(0) @Max(500) truck: number = 0;
}

export class CreateParkingLotDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  /** floors[0] is the ground floor. */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => FloorDto)
  floors: FloorDto[];
}
