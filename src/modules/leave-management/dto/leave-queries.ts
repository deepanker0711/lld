import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { LeaveStatus } from '../domain/leave-status';

export class ListLeavesQuery {
  @IsOptional()
  @IsString()
  employeeId?: string;

  @IsOptional()
  @IsEnum(LeaveStatus)
  status?: LeaveStatus;
}

export class BalancesQuery {
  /** Defaults to the current year (in the company time zone). */
  @IsOptional()
  @IsInt()
  @Min(2000)
  @Max(2100)
  year?: number;
}
