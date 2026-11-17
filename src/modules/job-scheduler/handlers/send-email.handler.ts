import { Injectable, Logger } from '@nestjs/common';
import { sleep } from '../../../common/utils/sleep';
import type { JobContext, JobHandler } from '../domain/job-handler';

/** Fast, succeeds if payload.to is a string. Missing `to` fails the run (and retries). */
@Injectable()
export class SendEmailHandler implements JobHandler {
  readonly type = 'SEND_EMAIL';
  private readonly logger = new Logger(SendEmailHandler.name);

  async handle(
    payload: Record<string, unknown>,
    ctx: JobContext,
  ): Promise<void> {
    if (typeof payload.to !== 'string')
      throw new Error('payload.to (string) is required');
    await sleep(100); // pretend to call an SMTP/provider API
    this.logger.log(
      `[${ctx.jobId} #${ctx.attempt}] email sent to ${payload.to}`,
    );
  }
}
