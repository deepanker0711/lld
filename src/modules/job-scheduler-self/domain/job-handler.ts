export interface JobContext {
  jobId: string;
}

export interface JobHandler {
  readonly type: string;
  handle(payload: Record<string, unknown>, context: JobContext): Promise<void>;
}

export const JOB_HANDLERS = Symbol('JOB_HANDLERS');
