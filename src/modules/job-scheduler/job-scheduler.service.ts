import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Clock } from '../../common/utils/clock';
import { sleep } from '../../common/utils/sleep';
import { compareJobs } from './domain/job-order';
import { JobStatus, assertTransition } from './domain/job-status';
import { MinHeap } from './domain/min-heap';
import { backoffDelay, nextRecurrence } from './domain/schedule-math';
import {
  SCHEDULER_OPTIONS,
  type SchedulerOptions,
} from './domain/scheduler-options';
import { JobRun, JobRunStatus } from './entities/job-run.entity';
import type { Job } from './entities/job.entity';
import { HandlerRegistry } from './handler-registry.service';
import { JobRunRepository } from './job-run.repository';
import { JobRepository } from './job.repository';

/**
 * The engine. Owns the priority queue of SCHEDULED jobs and the worker pool.
 *
 *   every tickMs:  while a worker is free AND the earliest job is due → pop → start (no await)
 *   job finishes:  record the run, then COMPLETED / FAILED / back into the heap
 *                  (retry or next recurrence), free the worker, tick again right away
 *
 * The heap holds references to the same Job objects the repository stores. Never
 * change runAt/priority/seq of a job while it is in the heap: pop it, change it, push it.
 */
@Injectable()
export class JobScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JobScheduler.name);
  private readonly queue = new MinHeap<Job>(compareJobs);
  /** Promises of handlers that are running right now. size = busy workers. */
  private readonly inFlight = new Set<Promise<void>>();
  private timer: NodeJS.Timeout | undefined;
  private stopped = false;

  constructor(
    private readonly jobs: JobRepository,
    private readonly runs: JobRunRepository,
    private readonly registry: HandlerRegistry,
    private readonly clock: Clock,
    @Inject(SCHEDULER_OPTIONS) private readonly options: SchedulerOptions,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => this.tick(), this.options.tickMs);
    this.timer.unref(); // don't keep the process alive just for this timer
  }

  /** Graceful shutdown: stop starting jobs, then give running ones a chance to finish. */
  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    clearInterval(this.timer);
    if (this.inFlight.size === 0) return;
    this.logger.log(`Waiting for ${this.inFlight.size} running job(s)...`);
    await Promise.race([
      Promise.allSettled([...this.inFlight]),
      sleep(this.options.shutdownTimeoutMs),
    ]);
  }

  enqueue(job: Job): void {
    this.queue.push(job);
  }

  /** Heap entries, including stale ones for cancelled jobs not yet popped. */
  get queuedCount(): number {
    return this.queue.size;
  }

  get poolSize(): number {
    return this.options.poolSize;
  }

  get busyWorkers(): number {
    return this.inFlight.size;
  }

  /** Next job to run, without removing it. */
  peekNext(): Job | undefined {
    return this.queue.peek();
  }

  /**
   * One pass of the loop. Public so tests can call it with a FakeClock instead of
   * waiting for the real interval. Fully synchronous: it never awaits a handler.
   */
  tick(): void {
    if (this.stopped) return;
    const now = this.clock.now();

    while (this.inFlight.size < this.options.poolSize) {
      const next = this.queue.peek();
      if (!next || next.runAt.getTime() > now) break; // heap top not due → nothing else is either
      this.queue.pop();
      // Lazy deletion: cancel only flips the status; the stale entry is dropped here.
      if (next.status !== JobStatus.SCHEDULED) continue;
      this.start(next);
    }
  }

  private start(job: Job): void {
    assertTransition(job.status, JobStatus.RUNNING, job.id);
    this.jobs.update(job.id, {
      status: JobStatus.RUNNING,
      attempts: job.attempts + 1,
    });
    const run = this.runs.create({
      jobId: job.id,
      attempt: job.attempts,
      scheduledFor: job.runAt,
      startedAt: this.clock.date(),
      finishedAt: null,
      status: JobRunStatus.RUNNING,
      error: null,
    });

    const work = this.execute(job, run)
      .catch((err) =>
        this.logger.error(`Bookkeeping failed for ${job.id}: ${String(err)}`),
      )
      .finally(() => {
        this.inFlight.delete(work);
        this.tick(); // a worker just freed up: don't wait up to tickMs for the next job
      });
    this.inFlight.add(work); // added synchronously, so the while-loop sees the slot as taken
  }

  private async execute(job: Job, run: JobRun): Promise<void> {
    try {
      const handler = this.registry.get(job.type);
      await handler.handle(job.payload, {
        jobId: job.id,
        attempt: job.attempts,
      });
    } catch (err) {
      this.onFailure(job, run, err);
      return;
    }
    this.onSuccess(job, run);
  }

  private onSuccess(job: Job, run: JobRun): void {
    this.finishRun(run, JobRunStatus.SUCCEEDED, null);

    if (job.intervalMs === null) {
      assertTransition(job.status, JobStatus.COMPLETED, job.id);
      this.jobs.update(job.id, {
        status: JobStatus.COMPLETED,
        lastError: null,
      });
      return;
    }
    // Recurring: same Job goes back into the heap at its next slot with a fresh retry budget.
    const next = nextRecurrence(
      job.firstRunAt.getTime(),
      job.intervalMs,
      this.clock.now(),
    );
    this.reschedule(job, next, { attempts: 0, lastError: null });
  }

  private onFailure(job: Job, run: JobRun, err: unknown): void {
    const message = errorMessage(err);
    this.finishRun(run, JobRunStatus.FAILED, message);
    const now = this.clock.now();

    if (job.attempts < job.maxAttempts) {
      // Retry the same occurrence. Recurrence is anchored to firstRunAt, so a retry that
      // moves runAt doesn't shift the recurring schedule.
      const delay = backoffDelay(
        job.attempts,
        this.options.baseBackoffMs,
        this.options.maxBackoffMs,
      );
      this.logger.warn(
        `${job.id} attempt ${job.attempts}/${job.maxAttempts} failed: ${message}; retry in ${delay}ms`,
      );
      this.reschedule(job, now + delay, { lastError: message });
      return;
    }

    if (job.intervalMs !== null) {
      // Recurring job gave up on this occurrence: skip to the next slot, keep the error visible.
      const next = nextRecurrence(
        job.firstRunAt.getTime(),
        job.intervalMs,
        now,
      );
      this.reschedule(job, next, { attempts: 0, lastError: message });
      return;
    }

    assertTransition(job.status, JobStatus.FAILED, job.id);
    this.jobs.update(job.id, { status: JobStatus.FAILED, lastError: message });
  }

  /**
   * RUNNING → SCHEDULED and back into the heap. Safe to change runAt here because a
   * RUNNING job is not in the heap.
   */
  private reschedule(job: Job, runAtMs: number, patch: Partial<Job>): void {
    assertTransition(job.status, JobStatus.SCHEDULED, job.id);
    this.jobs.update(job.id, {
      ...patch,
      status: JobStatus.SCHEDULED,
      runAt: new Date(runAtMs),
    });
    this.enqueue(job);
  }

  private finishRun(
    run: JobRun,
    status: JobRunStatus,
    error: string | null,
  ): void {
    this.runs.update(run.id, { status, error, finishedAt: this.clock.date() });
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
