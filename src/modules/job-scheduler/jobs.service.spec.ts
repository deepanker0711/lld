import { BadRequestError } from '../../common/errors/domain.errors';
import { JobStatus } from './domain/job-status';
import { NOW, createSchedulerKit } from './testing/scheduler-test-kit';

const setup = () => createSchedulerKit();

describe('JobsService.create', () => {
  it('fills defaults, runs now when no time is given, and enqueues the job', () => {
    const { service, scheduler } = setup();
    const job = service.create({ type: 'TEST' });
    expect(job).toMatchObject({
      status: JobStatus.SCHEDULED,
      payload: {},
      intervalMs: null,
      priority: 0,
      attempts: 0,
      maxAttempts: 3,
      lastError: null,
      seq: 1,
    });
    expect(job.runAt.getTime()).toBe(NOW);
    expect(scheduler.queuedCount).toBe(1);
    expect(service.get(job.id)).toBe(job);
  });

  it('computes runAt from delayMs', () => {
    const { service } = setup();
    expect(
      service.create({ type: 'TEST', delayMs: 3000 }).runAt.getTime(),
    ).toBe(NOW + 3000);
  });

  it('accepts a future runAt and rejects a past one', () => {
    const { service, scheduler } = setup();
    const job = service.create({ type: 'TEST', runAt: '2026-11-02T10:05:00Z' });
    expect(job.runAt.toISOString()).toBe('2026-11-02T10:05:00.000Z');
    expect(() =>
      service.create({ type: 'TEST', runAt: '2026-11-02T09:59:59Z' }),
    ).toThrow('runAt must not be in the past');
    expect(scheduler.queuedCount).toBe(1); // the rejected job was never stored or queued
  });

  it('rejects unknown types before storing anything', () => {
    const { service, scheduler } = setup();
    expect(() => service.create({ type: 'NOPE' })).toThrow(BadRequestError);
    expect(scheduler.queuedCount).toBe(0);
  });

  it('puts the most urgent job at the front of the queue', () => {
    const { service, scheduler } = setup();
    service.create({ type: 'TEST', delayMs: 5000 });
    const low = service.create({ type: 'TEST', delayMs: 1000, priority: 1 });
    const high = service.create({ type: 'TEST', delayMs: 1000, priority: 9 });
    expect(scheduler.peekNext()).toBe(high);
    expect(low.seq).toBeLessThan(high.seq); // priority beats insertion order
  });
});
