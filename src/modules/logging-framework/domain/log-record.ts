import { LevelName, LogLevel } from './log-level';

/** Immutable once built; every appender sees the same record. */
export interface LogRecord {
  readonly seq: number;
  readonly timestamp: Date;
  readonly level: LogLevel;
  readonly levelName: LevelName;
  readonly logger: string;
  readonly message: string;
  /** From LogContext (requestId, userId…): set once per request, not passed to every call. */
  readonly context: Readonly<Record<string, unknown>>;
  /** Structured fields for this call: { orderId, amount }. */
  readonly fields: Readonly<Record<string, unknown>>;
  readonly error?: { name: string; message: string; stack?: string };
}
