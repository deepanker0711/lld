import type { Job } from '../entities/job.entity';

/**
 * Heap order: earliest runAt first, then higher priority, then FIFO by seq.
 * seq is unique, so two jobs never compare equal and the order is deterministic.
 */
export function compareJobs(a: Job, b: Job): number {
  return (
    a.runAt.getTime() - b.runAt.getTime() ||
    b.priority - a.priority ||
    a.seq - b.seq
  );
}
