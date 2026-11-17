import { Injectable } from '@nestjs/common';
import type { JobContext, JobHandler } from '../domain/job-handler';

/** Always fails. Shows retries with backoff ending in FAILED. */
@Injectable()
export class FailAlwaysHandler implements JobHandler {
  readonly type = 'FAIL_ALWAYS';

  async handle(
    _payload: Record<string, unknown>,
    ctx: JobContext,
  ): Promise<void> {
    throw new Error(`always fails (attempt ${ctx.attempt})`);
  }
}
