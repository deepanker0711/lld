import { Logger } from '@nestjs/common';
import { FailAlwaysHandler } from './fail-always.handler';
import { FailRandomlyHandler } from './fail-randomly.handler';
import { GenerateReportHandler } from './generate-report.handler';
import { SendEmailHandler } from './send-email.handler';

const ctx = { jobId: 'job_1', attempt: 1 };

describe('demo job handlers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('SEND_EMAIL succeeds with `to` and fails without it', async () => {
    const handler = new SendEmailHandler();
    const ok = handler.handle({ to: 'a@x.com' }, ctx);
    await vi.advanceTimersByTimeAsync(100);
    await expect(ok).resolves.toBeUndefined();
    await expect(handler.handle({}, ctx)).rejects.toThrow('payload.to');
  });

  it('GENERATE_REPORT takes 2s by default', async () => {
    let done = false;
    const run = new GenerateReportHandler()
      .handle({}, ctx)
      .then(() => (done = true));
    await vi.advanceTimersByTimeAsync(1999);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await run;
    expect(done).toBe(true);
  });

  it('FAIL_RANDOMLY fails when Math.random() is below failRate', async () => {
    const handler = new FailRandomlyHandler();
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    await expect(handler.handle({ failRate: 0.5 }, ctx)).rejects.toThrow(
      'random failure',
    );
    vi.spyOn(Math, 'random').mockReturnValue(0.9);
    await expect(
      handler.handle({ failRate: 0.5 }, ctx),
    ).resolves.toBeUndefined();
  });

  it('FAIL_ALWAYS always rejects', async () => {
    await expect(
      new FailAlwaysHandler().handle({}, { jobId: 'j', attempt: 3 }),
    ).rejects.toThrow('attempt 3');
  });
});
