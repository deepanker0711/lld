import { FakeClock } from '../../../common/utils/clock';
import { SequenceGenerator } from '../../../common/utils/id.generator';
import type { JobContext, JobHandler } from '../domain/job-handler';
import {
  DEFAULT_SCHEDULER_OPTIONS,
  type SchedulerOptions,
} from '../domain/scheduler-options';
import { HandlerRegistry } from '../handler-registry.service';
import { JobRunRepository } from '../job-run.repository';
import { JobRepository } from '../job.repository';
import { JobScheduler } from '../job-scheduler.service';
import { JobsService } from '../jobs.service';

export const NOW = Date.parse('2026-11-02T10:00:00.000Z');

/** Lets pending promise callbacks (handler resolution, .finally) run. */
export const flush = () =>
  new Promise<void>((resolve) => setImmediate(resolve));

/**
 * A handler the test controls: every call is recorded and stays pending until the
 * test calls succeed()/fail() on it. `onCall` runs when a call starts (e.g. to move the clock).
 */
export class ControlledHandler implements JobHandler {
  readonly calls: {
    jobId: string;
    attempt: number;
    succeed: () => void;
    fail: (msg?: string) => void;
  }[] = [];

  constructor(readonly type: string) {}

  handle(_payload: Record<string, unknown>, ctx: JobContext): Promise<void> {
    return new Promise((resolve, reject) => {
      this.calls.push({
        ...ctx,
        succeed: () => resolve(),
        fail: (msg = 'boom') => reject(new Error(msg)),
      });
    });
  }

  get started(): string[] {
    return this.calls.map((c) => c.jobId);
  }
}

/** Real services wired by hand: no Nest container, no real timers (tick() is called manually). */
export function createSchedulerKit(options: Partial<SchedulerOptions> = {}) {
  const clock = new FakeClock(NOW);
  const handler = new ControlledHandler('TEST');
  const registry = new HandlerRegistry([handler]);
  const jobs = new JobRepository();
  const runs = new JobRunRepository();
  const scheduler = new JobScheduler(jobs, runs, registry, clock, {
    ...DEFAULT_SCHEDULER_OPTIONS,
    ...options,
  });
  const service = new JobsService(
    jobs,
    runs,
    registry,
    scheduler,
    clock,
    new SequenceGenerator(),
  );
  return { clock, handler, jobs, runs, scheduler, service };
}
