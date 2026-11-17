import { Logger } from '@nestjs/common';
import { ConflictError } from '../../common/errors/domain.errors';
import { JobStatus } from './domain/job-status';
import { createSchedulerKit, flush } from './testing/scheduler-test-kit';

describe('JobsService: cancel, list, stats (T7)', () => {
  beforeEach(() =>
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {}),
  );
  afterEach(() => vi.restoreAllMocks());

  it('cancel is lazy: status flips now, the heap entry is skipped when popped', () => {
    const { handler, scheduler, service, clock } = createSchedulerKit();
    const job = service.create({ type: 'TEST', delayMs: 1000 });

    service.cancel(job.id);
    expect(job.status).toBe(JobStatus.CANCELLED);
    expect(scheduler.queuedCount).toBe(1); // stale entry still in the heap

    clock.advance(1000);
    scheduler.tick();
    expect(handler.calls).toHaveLength(0); // never ran
    expect(scheduler.queuedCount).toBe(0); // dropped on pop
  });

  it('a cancelled job does not take a worker slot from a due job behind it', () => {
    const { handler, scheduler, service } = createSchedulerKit({ poolSize: 1 });
    const first = service.create({ type: 'TEST', priority: 9 });
    const second = service.create({ type: 'TEST' });
    service.cancel(first.id);
    scheduler.tick();
    expect(handler.started).toEqual([second.id]);
  });

  it('cannot cancel RUNNING or finished jobs (409)', async () => {
    const { handler, scheduler, service } = createSchedulerKit();
    const job = service.create({ type: 'TEST' });
    scheduler.tick();
    expect(() => service.cancel(job.id)).toThrow(ConflictError); // RUNNING

    handler.calls[0].succeed();
    await flush();
    expect(() => service.cancel(job.id)).toThrow(ConflictError); // COMPLETED
  });

  it('cancelling a recurring job between runs stops it', async () => {
    const { handler, scheduler, service, clock } = createSchedulerKit();
    const job = service.create({ type: 'TEST', intervalMs: 5000 });
    scheduler.tick();
    handler.calls[0].succeed();
    await flush();
    expect(job.status).toBe(JobStatus.SCHEDULED);

    service.cancel(job.id);
    clock.advance(5000);
    scheduler.tick();
    expect(handler.calls).toHaveLength(1);
  });

  it('lists by status, newest first, and reports stats', async () => {
    const { handler, scheduler, service } = createSchedulerKit({ poolSize: 1 });
    const a = service.create({ type: 'TEST' });
    const b = service.create({ type: 'TEST', delayMs: 60_000 });
    const c = service.create({ type: 'TEST', delayMs: 60_000 });
    service.cancel(c.id);
    scheduler.tick(); // a starts

    expect(service.list().map((j) => j.id)).toEqual([c.id, b.id, a.id]);
    expect(service.list(JobStatus.SCHEDULED).map((j) => j.id)).toEqual([b.id]);
    expect(service.stats()).toEqual({
      jobs: { SCHEDULED: 1, RUNNING: 1, COMPLETED: 0, FAILED: 0, CANCELLED: 1 },
      workers: { busy: 1, size: 1 },
      heapEntries: 2, // b + stale c
    });

    handler.calls[0].succeed();
    await flush();
    expect(service.stats().jobs.COMPLETED).toBe(1);
  });
});
