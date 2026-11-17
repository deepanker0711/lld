import { Logger } from '@nestjs/common';
import { JobStatus } from './domain/job-status';
import { NOW, createSchedulerKit, flush } from './testing/scheduler-test-kit';

beforeEach(() =>
  vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {}),
);
afterEach(() => vi.restoreAllMocks());

describe('JobScheduler: tick loop (T5)', () => {
  it('does not start a job before runAt, starts it once due', () => {
    const { clock, handler, scheduler, service } = createSchedulerKit();
    const job = service.create({ type: 'TEST', delayMs: 1000 });

    scheduler.tick();
    expect(handler.calls).toHaveLength(0);

    clock.advance(999);
    scheduler.tick();
    expect(handler.calls).toHaveLength(0);

    clock.advance(1);
    scheduler.tick();
    expect(handler.started).toEqual([job.id]);
    expect(job).toMatchObject({ status: JobStatus.RUNNING, attempts: 1 });
    expect(scheduler.queuedCount).toBe(0);
  });

  it('never runs more than poolSize jobs at once; extras wait in the heap', () => {
    const { handler, scheduler, service } = createSchedulerKit({ poolSize: 2 });
    const [a, b, c] = [1, 2, 3].map(() => service.create({ type: 'TEST' }));

    scheduler.tick();
    expect(handler.started).toEqual([a.id, b.id]);
    expect(scheduler.busyWorkers).toBe(2);
    expect(c.status).toBe(JobStatus.SCHEDULED);
    expect(scheduler.queuedCount).toBe(1);
  });

  it('starts the next waiting job as soon as a worker frees up, without waiting for a tick', async () => {
    const { handler, scheduler, service } = createSchedulerKit({ poolSize: 1 });
    const [a, b] = [1, 2].map(() => service.create({ type: 'TEST' }));

    scheduler.tick();
    expect(handler.started).toEqual([a.id]);

    handler.calls[0].succeed();
    await flush();
    expect(a.status).toBe(JobStatus.COMPLETED);
    expect(handler.started).toEqual([a.id, b.id]); // started by the .finally → tick(), no manual tick
  });

  it('picks by priority when more jobs are due than workers', () => {
    const { handler, scheduler, service } = createSchedulerKit({ poolSize: 1 });
    service.create({ type: 'TEST', priority: 1 });
    const urgent = service.create({ type: 'TEST', priority: 9 });

    scheduler.tick();
    expect(handler.started).toEqual([urgent.id]);
  });

  it('marks the job FAILED with the error message when the handler throws', async () => {
    const { handler, scheduler, service } = createSchedulerKit();
    const job = service.create({ type: 'TEST', maxAttempts: 1 });

    scheduler.tick();
    handler.calls[0].fail('smtp down');
    await flush();
    expect(job).toMatchObject({
      status: JobStatus.FAILED,
      lastError: 'smtp down',
    });
    expect(scheduler.busyWorkers).toBe(0);
  });

  it('stops starting jobs after shutdown', async () => {
    const { handler, scheduler, service } = createSchedulerKit();
    service.create({ type: 'TEST' });
    await scheduler.onModuleDestroy();
    scheduler.tick();
    expect(handler.calls).toHaveLength(0);
  });
});

describe('JobScheduler: completion (T6)', () => {
  it('one-off success → COMPLETED with a SUCCEEDED run', async () => {
    const { handler, scheduler, service, clock } = createSchedulerKit();
    const job = service.create({ type: 'TEST' });

    scheduler.tick();
    clock.advance(250);
    handler.calls[0].succeed();
    await flush();

    expect(job).toMatchObject({
      status: JobStatus.COMPLETED,
      attempts: 1,
      lastError: null,
    });
    const { runs } = service.getWithRuns(job.id);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      attempt: 1,
      status: 'SUCCEEDED',
      error: null,
    });
    expect(runs[0].finishedAt!.getTime() - runs[0].startedAt.getTime()).toBe(
      250,
    );
  });

  it('retries with exponential backoff, then FAILED after maxAttempts', async () => {
    const { handler, scheduler, service, clock } = createSchedulerKit({
      baseBackoffMs: 1000,
    });
    const job = service.create({ type: 'TEST', maxAttempts: 3 });

    const failNext = async (msg: string) => {
      scheduler.tick();
      handler.calls.at(-1)!.fail(msg);
      await flush();
    };

    await failNext('e1');
    expect(job).toMatchObject({
      status: JobStatus.SCHEDULED,
      attempts: 1,
      lastError: 'e1',
    });
    expect(job.runAt.getTime() - clock.now()).toBe(1000); // 1st backoff: 1s

    clock.advance(999);
    scheduler.tick();
    expect(handler.calls).toHaveLength(1); // not due yet

    clock.advance(1);
    await failNext('e2');
    expect(job.runAt.getTime() - clock.now()).toBe(2000); // 2nd backoff: 2s

    clock.advance(2000);
    await failNext('e3');
    expect(job).toMatchObject({
      status: JobStatus.FAILED,
      attempts: 3,
      lastError: 'e3',
    });
    expect(scheduler.queuedCount).toBe(0);
    expect(
      service
        .getWithRuns(job.id)
        .runs.map((r) => [r.attempt, r.status, r.error]),
    ).toEqual([
      [1, 'FAILED', 'e1'],
      [2, 'FAILED', 'e2'],
      [3, 'FAILED', 'e3'],
    ]);
  });

  it('a retry that then succeeds ends COMPLETED', async () => {
    const { handler, scheduler, service, clock } = createSchedulerKit();
    const job = service.create({ type: 'TEST', maxAttempts: 3 });
    scheduler.tick();
    handler.calls[0].fail();
    await flush();
    clock.advance(1000);
    scheduler.tick();
    handler.calls[1].succeed();
    await flush();
    expect(job).toMatchObject({
      status: JobStatus.COMPLETED,
      attempts: 2,
      lastError: null,
    });
  });

  it('recurring: next run is anchored to the schedule, not to when the run finished', async () => {
    const { handler, scheduler, service, clock } = createSchedulerKit();
    const job = service.create({ type: 'TEST', intervalMs: 5000 }); // first run at NOW

    scheduler.tick();
    clock.advance(1200); // the run takes 1.2s
    handler.calls[0].succeed();
    await flush();
    expect(job.status).toBe(JobStatus.SCHEDULED);
    expect(job.runAt.getTime()).toBe(NOW + 5000); // not NOW + 1200 + 5000

    clock.set(NOW + 5000);
    scheduler.tick();
    handler.calls[1].succeed();
    await flush();
    expect(job.runAt.getTime()).toBe(NOW + 10_000);
    expect(service.getWithRuns(job.id).runs).toHaveLength(2);
  });

  it('recurring: skips missed slots after a very long run', async () => {
    const { handler, scheduler, service, clock } = createSchedulerKit();
    const job = service.create({ type: 'TEST', intervalMs: 5000 });
    scheduler.tick();
    clock.advance(12_000); // missed the 5s and 10s slots
    handler.calls[0].succeed();
    await flush();
    expect(job.runAt.getTime()).toBe(NOW + 15_000);
  });

  it('recurring: retries do not shift the grid, and an exhausted occurrence moves on to the next slot', async () => {
    const { handler, scheduler, service, clock } = createSchedulerKit({
      baseBackoffMs: 1000,
    });
    const job = service.create({
      type: 'TEST',
      intervalMs: 10_000,
      maxAttempts: 2,
    });

    scheduler.tick();
    handler.calls[0].fail('e1');
    await flush();
    expect(job.runAt.getTime()).toBe(NOW + 1000); // retry

    clock.set(NOW + 1000);
    scheduler.tick();
    handler.calls[1].fail('e2'); // attempts exhausted for this occurrence
    await flush();
    expect(job).toMatchObject({
      status: JobStatus.SCHEDULED,
      attempts: 0,
      lastError: 'e2',
    });
    expect(job.runAt.getTime()).toBe(NOW + 10_000); // next grid slot, not failure time + 10s
  });
});
