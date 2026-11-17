import { ConflictError } from '../../../common/errors/domain.errors';

export enum JobStatus {
  SCHEDULED = 'SCHEDULED',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

/**
 * State pattern as a table: for each status, the statuses it may move to.
 *
 *              ┌──────── retry / next recurrence ────────┐
 *              ▼                                         │
 *   ──► SCHEDULED ──── tick picks it ────► RUNNING ──────┤
 *              │                                         ├──► COMPLETED
 *              └──► CANCELLED                            └──► FAILED
 *
 * RUNNING → CANCELLED is deliberately missing: we can't stop a handler that is
 * already executing, so cancelling a running job is a 409.
 *
 * `Record<JobStatus, ...>` makes the compiler reject the table if a status is
 * added to the enum but not here.
 */
export const JOB_TRANSITIONS: Record<JobStatus, readonly JobStatus[]> = {
  [JobStatus.SCHEDULED]: [JobStatus.RUNNING, JobStatus.CANCELLED],
  [JobStatus.RUNNING]: [
    JobStatus.COMPLETED,
    JobStatus.FAILED,
    JobStatus.SCHEDULED,
  ],
  [JobStatus.COMPLETED]: [],
  [JobStatus.FAILED]: [],
  [JobStatus.CANCELLED]: [],
};

export function canTransition(from: JobStatus, to: JobStatus): boolean {
  return JOB_TRANSITIONS[from].includes(to);
}

/** Terminal = no way out. These jobs never go back into the heap. */
export function isTerminal(status: JobStatus): boolean {
  return JOB_TRANSITIONS[status].length === 0;
}

/** Guard used before every status change. Throws 409 so the API can say why. */
export function assertTransition(
  from: JobStatus,
  to: JobStatus,
  jobId?: string,
): void {
  if (canTransition(from, to)) return;
  const who = jobId ? `Job '${jobId}'` : 'Job';
  throw new ConflictError(`${who} cannot move from ${from} to ${to}`, {
    from,
    to,
    allowed: JOB_TRANSITIONS[from],
  });
}
