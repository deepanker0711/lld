import { BaseEntity } from '../../../common/entities/base.entity';
import { JobStatus } from '../domain/job-status';

/**
 * One scheduled unit of work. A recurring job is a single Job whose runAt moves
 * forward after each run; every execution is recorded as a JobRun.
 */
export class Job extends BaseEntity {
  /** Handler name, e.g. 'SEND_EMAIL'. Looked up in the HandlerRegistry. */
  type: string;
  payload: Record<string, unknown>;

  /** When the job is next due. The heap orders by this first. */
  runAt: Date;
  /** null = one-off. Otherwise runs on the grid firstRunAt + k × intervalMs. */
  intervalMs: number | null;
  /** The first scheduled run. Anchor of the recurring grid; retries move runAt but never this. */
  firstRunAt: Date;
  /** Higher runs first when several jobs are due at the same time. */
  priority: number;

  status: JobStatus;
  /** Attempts in the current cycle. Reset to 0 when a recurring job succeeds. */
  attempts: number;
  maxAttempts: number;
  lastError: string | null;

  /** Insertion counter, the final heap tie-breaker so equal jobs run FIFO. */
  seq: number;
}
