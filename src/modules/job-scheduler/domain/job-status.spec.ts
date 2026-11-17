import { ConflictError } from '../../../common/errors/domain.errors';
import {
  JobStatus,
  assertTransition,
  canTransition,
  isTerminal,
} from './job-status';

const { SCHEDULED, RUNNING, COMPLETED, FAILED, CANCELLED } = JobStatus;

describe('Job status transitions', () => {
  it.each([
    [SCHEDULED, RUNNING],
    [SCHEDULED, CANCELLED],
    [RUNNING, COMPLETED],
    [RUNNING, FAILED],
    [RUNNING, SCHEDULED],
  ])('allows %s → %s', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
    expect(() => assertTransition(from, to)).not.toThrow();
  });

  it.each([
    [RUNNING, CANCELLED],
    [SCHEDULED, COMPLETED],
    [COMPLETED, CANCELLED],
    [FAILED, SCHEDULED],
    [CANCELLED, RUNNING],
  ])('rejects %s → %s with ConflictError', (from, to) => {
    expect(canTransition(from, to)).toBe(false);
    expect(() => assertTransition(from, to)).toThrow(ConflictError);
  });

  it('includes the job id and allowed targets in the error', () => {
    try {
      assertTransition(COMPLETED, CANCELLED, 'job_1');
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ConflictError);
      expect((err as ConflictError).message).toBe(
        "Job 'job_1' cannot move from COMPLETED to CANCELLED",
      );
      expect((err as ConflictError).details).toEqual({
        from: COMPLETED,
        to: CANCELLED,
        allowed: [],
      });
    }
  });

  it('marks exactly COMPLETED, FAILED and CANCELLED as terminal', () => {
    const terminal = Object.values(JobStatus).filter(isTerminal);
    expect(terminal).toEqual([COMPLETED, FAILED, CANCELLED]);
  });
});
