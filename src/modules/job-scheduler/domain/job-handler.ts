/** Passed to every handler so it can log or behave differently on retries. */
export interface JobContext {
  jobId: string;
  /** 1-based attempt within the current cycle. */
  attempt: number;
}

/**
 * Strategy: one class per job type. The scheduler never knows what a job does; it
 * looks the handler up by `type` and awaits `handle()`.
 *
 *   resolves → the run succeeded
 *   rejects  → the run failed (the scheduler retries with backoff or marks FAILED)
 */
export interface JobHandler {
  readonly type: string;
  handle(payload: Record<string, unknown>, ctx: JobContext): Promise<void>;
}

/** DI token for "all handler instances", collected in JobSchedulerModule. */
export const JOB_HANDLERS = Symbol('JOB_HANDLERS');
