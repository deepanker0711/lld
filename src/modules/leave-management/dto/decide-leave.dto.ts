import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class ApproveLeaveDto {
  @IsString()
  @IsNotEmpty()
  approverId: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}

/** A rejection must say why. */
export class RejectLeaveDto {
  @IsString()
  @IsNotEmpty()
  approverId: string;

  @IsString()
  @IsNotEmpty({ message: 'comment is required when rejecting' })
  @MaxLength(500)
  comment: string;
}

export class CancelLeaveDto {
  @IsString()
  @IsNotEmpty()
  employeeId: string;
}
