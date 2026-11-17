import { Injectable } from '@nestjs/common';
import { BadRequestError } from '../../common/errors/domain.errors';
import { Clock } from '../../common/utils/clock';
import { SequenceGenerator } from '../../common/utils/id.generator';
import { JobStatus, assertTransition } from './domain/job-status';
import { CreateJobDto } from './dto/create-job.dto';
import { JobRun } from './entities/job-run.entity';
import { Job } from './entities/job.entity';
import { HandlerRegistry } from './handler-registry.service';
import { JobRunRepository } from './job-run.repository';
import { JobRepository } from './job.repository';
import { JobScheduler } from './job-scheduler.service';

const DEFAULT_PRIORITY = 0;
const DEFAULT_MAX_ATTEMPTS = 3;

/** HTTP use cases for jobs. Validates, stores, and hands the job to the scheduler. */
@Injectable()
export class JobsService {
  constructor(
    private readonly jobs: JobRepository,
    private readonly runs: JobRunRepository,
    private readonly registry: HandlerRegistry,
    private readonly scheduler: JobScheduler,
    private readonly clock: Clock,
    private readonly sequence: SequenceGenerator,
  ) {}

  create(dto: CreateJobDto): Job {
    this.registry.get(dto.type); // 400 with knownTypes if the type has no handler
    const runAt = this.resolveRunAt(dto);

    const job = this.jobs.create({
      type: dto.type,
      payload: dto.payload ?? {},
      runAt,
      firstRunAt: runAt,
      intervalMs: dto.intervalMs ?? null,
      priority: dto.priority ?? DEFAULT_PRIORITY,
      status: JobStatus.SCHEDULED,
      attempts: 0,
      maxAttempts: dto.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
      lastError: null,
      seq: this.sequence.next('job'),
    });
    this.scheduler.enqueue(job);
    return job;
  }

  get(id: string): Job {
    return this.jobs.findByIdOrThrow(id);
  }

  /** GET /jobs/:id: the job plus its execution history (oldest first). */
  getWithRuns(id: string): Job & { runs: JobRun[] } {
    const job = this.get(id);
    return { ...job, runs: this.runs.findByJob(id) };
  }

  /** GET /jobs?status=: newest first. */
  list(status?: JobStatus): Job[] {
    const jobs = this.jobs.findAll(
      status ? (j) => j.status === status : undefined,
    );
    return jobs.reverse();
  }

  /**
   * Lazy deletion: O(1). Only the status changes; the job's heap entry stays until
   * the scheduler pops it and skips it. Removing it from the middle of a heap would
   * need an index map and O(log n) work.
   *
   * Only SCHEDULED jobs can be cancelled (transition table): RUNNING/COMPLETED/... → 409.
   */
  cancel(id: string): Job {
    const job = this.get(id);
    assertTransition(job.status, JobStatus.CANCELLED, id);
    return this.jobs.update(id, { status: JobStatus.CANCELLED });
  }

  stats() {
    const byStatus = Object.fromEntries(
      Object.values(JobStatus).map((s) => [s, 0]),
    ) as Record<JobStatus, number>;
    for (const job of this.jobs.findAll()) byStatus[job.status]++;

    return {
      jobs: byStatus,
      workers: {
        busy: this.scheduler.busyWorkers,
        size: this.scheduler.poolSize,
      },
      // heapEntries - jobs.SCHEDULED = stale entries left by lazy cancel
      heapEntries: this.scheduler.queuedCount,
    };
  }

  /** runAt (absolute) or delayMs (relative) or neither (= now). The DTO already rejected both. */
  private resolveRunAt(dto: CreateJobDto): Date {
    const now = this.clock.now();
    if (dto.runAt === undefined) return new Date(now + (dto.delayMs ?? 0));

    const runAt = new Date(dto.runAt);
    if (runAt.getTime() < now) {
      throw new BadRequestError('runAt must not be in the past', {
        runAt: runAt.toISOString(),
        now: new Date(now).toISOString(),
      });
    }
    return runAt;
  }
}
