import { Injectable } from '@nestjs/common';
import type { JobContext, JobHandler } from '../domain/job-handler';

/** Fails with probability payload.failRate (0..1, default 0.5). Shows retries that eventually succeed. */
@Injectable()
export class FailRandomlyHandler implements JobHandler {
  readonly type = 'FAIL_RANDOMLY';

  async handle(
    payload: Record<string, unknown>,
    ctx: JobContext,
  ): Promise<void> {
    const failRate =
      typeof payload.failRate === 'number' ? payload.failRate : 0.5;
    if (Math.random() < failRate) {
      throw new Error(
        `random failure on attempt ${ctx.attempt} (failRate=${failRate})`,
      );
    }
  }
}
