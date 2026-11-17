export interface SchedulerOptions {
  tickMs: number;
}

export const DEFAULT_SCHEDULER_OPTIONS: SchedulerOptions = {
  tickMs: 5000, // Default tick interval of 5 seconds
};

export const SCHEDULER_OPTIONS = Symbol('SCHEDULER_OPTIONS');
