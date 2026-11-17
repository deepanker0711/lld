import { Injectable, Logger } from '@nestjs/common';
import { sleep } from '../../../common/utils/sleep';
import type { JobContext, JobHandler } from '../domain/job-handler';

const DEFAULT_DURATION_MS = 2000;
const MAX_DURATION_MS = 30_000;

/**
 * Slow job (2s by default, override with payload.durationMs). Use it in the demo to
 * fill the worker pool and show that other due jobs wait their turn.
 */
@Injectable()
export class GenerateReportHandler implements JobHandler {
  readonly type = 'GENERATE_REPORT';
  private readonly logger = new Logger(GenerateReportHandler.name);

  async handle(
    payload: Record<string, unknown>,
    ctx: JobContext,
  ): Promise<void> {
    const requested =
      typeof payload.durationMs === 'number'
        ? payload.durationMs
        : DEFAULT_DURATION_MS;
    const durationMs = Math.min(Math.max(requested, 0), MAX_DURATION_MS);
    await sleep(durationMs);
    this.logger.log(
      `[${ctx.jobId} #${ctx.attempt}] report ready after ${durationMs}ms`,
    );
  }
}
