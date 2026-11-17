export enum JobStatus {
  SCHEDULED = 'SCHEDULED',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

export const JobStatusValues = Object.values(JobStatus);

export const JobTransitionMap: Record<JobStatus, readonly JobStatus[]> = {
  [JobStatus.SCHEDULED]: [JobStatus.RUNNING, JobStatus.CANCELLED],
  [JobStatus.RUNNING]: [
    JobStatus.COMPLETED,
    JobStatus.FAILED,
    JobStatus.CANCELLED,
  ],
  [JobStatus.COMPLETED]: [],
  [JobStatus.FAILED]: [],
  [JobStatus.CANCELLED]: [],
};

export function isValidTransition(
  fromStatus: JobStatus,
  toStatus: JobStatus,
): boolean {
  const validTransitions = JobTransitionMap[fromStatus];
  return validTransitions.includes(toStatus);
}

export function assertTransition(
  fromStatus: JobStatus,
  toStatus: JobStatus,
): void {
  if (!isValidTransition(fromStatus, toStatus)) {
    throw new Error(
      `Invalid transition from ${fromStatus} to ${toStatus}. Valid transitions are: ${JobTransitionMap[
        fromStatus
      ].join(', ')}`,
    );
  }
}
