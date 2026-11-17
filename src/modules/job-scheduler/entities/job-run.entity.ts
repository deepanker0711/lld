import { BaseEntity } from '../../../common/entities/base.entity';

export enum JobRunStatus {
  RUNNING = 'RUNNING',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
}

/**
 * Execution history: one row per attempt. Kept separate from Job so the Job stays
 * small and the history can grow (or be capped/archived) on its own.
 */
export class JobRun extends BaseEntity {
  jobId: string;
  /** 1-based attempt number within the current cycle. */
  attempt: number;
  /** The runAt this attempt was for. startedAt - scheduledFor = how late the scheduler was. */
  scheduledFor: Date;
  startedAt: Date;
  finishedAt: Date | null;
  status: JobRunStatus;
  error: string | null;
}
