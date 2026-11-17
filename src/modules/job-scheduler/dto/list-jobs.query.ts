import { IsEnum, IsOptional } from 'class-validator';
import { JobStatus } from '../domain/job-status';

export class ListJobsQuery {
  @IsOptional()
  @IsEnum(JobStatus)
  status?: JobStatus;
}
