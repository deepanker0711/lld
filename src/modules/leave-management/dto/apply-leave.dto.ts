import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { IsDateOnly } from '../../../common/validators/is-date-only';
import { RawValue } from '../../../common/validators/raw-value';
import { LeaveType } from '../domain/leave-type';

export class ApplyLeaveDto {
  /** In a real app this comes from the auth token, not the body. */
  @IsString()
  @IsNotEmpty()
  employeeId: string;

  @IsEnum(LeaveType)
  type: LeaveType;

  @IsDateOnly()
  from: string;

  @IsDateOnly()
  to: string;

  /** Only for a single day. RawValue: "false" must not become true (README §7). */
  @IsOptional()
  @RawValue()
  @IsBoolean()
  halfDay: boolean = false;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}
