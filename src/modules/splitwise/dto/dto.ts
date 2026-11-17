import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { SplitType } from '../domain/split.strategy';

export class CreateMemberDto {
  @IsString() @IsNotEmpty() @MaxLength(100) name: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  email: string;
}

export class CreateGroupDto {
  @IsString() @IsNotEmpty() @MaxLength(100) name: string;

  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(50)
  @IsString({ each: true })
  memberIds: string[];
}

export class AddGroupMemberDto {
  @IsString() @IsNotEmpty() memberId: string;
}

export class SplitInputDto {
  @IsString() @IsNotEmpty() memberId: string;

  /** EXACT: paise · PERCENT: percent, 2 decimals · SHARES: integer weight · EQUAL: omit. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  value?: number;
}

export class AddExpenseDto {
  @IsString() @IsNotEmpty() @MaxLength(200) description: string;
  @IsString() @IsNotEmpty() paidBy: string;

  @IsInt()
  @Min(1)
  @Max(1_00_00_000_00)
  amountPaise: number;

  @IsEnum(SplitType)
  splitType: SplitType;

  /** Who shares the cost. The payer is included only if they also consumed. */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => SplitInputDto)
  splits: SplitInputDto[];
}

export class SettleDto {
  @IsString() @IsNotEmpty() from: string;
  @IsString() @IsNotEmpty() to: string;
  @IsInt() @Min(1) amountPaise: number;
}
