import { LogLevel } from './log-level';

type Message = string | (() => string);

/** What a Logger needs from its manager. Keeps Logger tiny and testable. */
export interface LogSink {
  isEnabled(logger: string, level: LogLevel): boolean;
  emit(logger: string, level: LogLevel, message: string, fields?: Record<string, unknown>, error?: unknown): void;
}

/**
 * A named handle ("app.orders.payment"). Cheap: holds no level or appenders itself;
 * the manager resolves the effective level, so changing "app.orders" at runtime affects
 * every logger under it immediately.
 */
export class Logger {
  constructor(
    readonly name: string,
    private readonly sink: LogSink,
  ) {}

  trace(msg: Message, fields?: Record<string, unknown>) {
    this.log(LogLevel.TRACE, msg, fields);
  }
  debug(msg: Message, fields?: Record<string, unknown>) {
    this.log(LogLevel.DEBUG, msg, fields);
  }
  info(msg: Message, fields?: Record<string, unknown>) {
    this.log(LogLevel.INFO, msg, fields);
  }
  warn(msg: Message, fields?: Record<string, unknown>) {
    this.log(LogLevel.WARN, msg, fields);
  }
  error(msg: Message, error?: unknown, fields?: Record<string, unknown>) {
    this.log(LogLevel.ERROR, msg, fields, error);
  }
  fatal(msg: Message, error?: unknown, fields?: Record<string, unknown>) {
    this.log(LogLevel.FATAL, msg, fields, error);
  }

  isEnabled(level: LogLevel): boolean {
    return this.sink.isEnabled(this.name, level);
  }

  /**
   * Level check FIRST: a disabled debug line costs one comparison, and a lazy message
   * (`() => JSON.stringify(big)`) is never even built.
   */
  private log(level: LogLevel, msg: Message, fields?: Record<string, unknown>, error?: unknown): void {
    if (!this.sink.isEnabled(this.name, level)) return;
    this.sink.emit(this.name, level, typeof msg === 'function' ? msg() : msg, fields, error);
  }
}
