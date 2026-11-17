import { Appender } from './appenders';
import { LogContext } from './log-context';
import { levelName, LogLevel } from './log-level';
import { LogRecord } from './log-record';
import { Logger, LogSink } from './logger';
import { RecordProcessor } from './processors';

export const ROOT = 'root';

export interface LoggingStats {
  emitted: Record<string, number>;
  appenderErrors: number;
  droppedByProcessors: number;
}

/**
 * The registry (one per process: a Nest singleton provider, not a global static).
 * - getLogger(name) returns the same Logger for the same name (Flyweight).
 * - Levels are hierarchical: "app.orders.payment" inherits from "app.orders", then "app",
 *   then root. Effective levels are cached and the cache is cleared on any change.
 * - Records go through processors (Chain of Responsibility), then to every appender
 *   (Observer). A failing appender is counted, never thrown into business code.
 */
export class LogManager implements LogSink {
  private readonly loggers = new Map<string, Logger>();
  private readonly levels = new Map<string, LogLevel>([[ROOT, LogLevel.INFO]]);
  private readonly effective = new Map<string, LogLevel>();
  private readonly appenders: Appender[] = [];
  private readonly processors: RecordProcessor[] = [];
  private seq = 0;
  private readonly stats: LoggingStats = { emitted: {}, appenderErrors: 0, droppedByProcessors: 0 };

  constructor(private readonly now: () => Date = () => new Date()) {}

  getLogger(name: string): Logger {
    if (!/^[a-z0-9_-]+(\.[a-z0-9_-]+)*$/i.test(name)) throw new Error(`Invalid logger name '${name}'`);
    let logger = this.loggers.get(name);
    if (!logger) {
      logger = new Logger(name, this);
      this.loggers.set(name, logger);
    }
    return logger;
  }

  addAppender(appender: Appender): this {
    this.appenders.push(appender);
    return this;
  }

  addProcessor(p: RecordProcessor): this {
    this.processors.push(p);
    return this;
  }

  getAppender<T extends Appender>(name: string): T | undefined {
    return this.appenders.find((a) => a.name === name) as T | undefined;
  }

  /** null clears an explicit level so the logger inherits again (not allowed for root). */
  setLevel(name: string, level: LogLevel | null): void {
    if (level === null) {
      if (name === ROOT) throw new Error('root always has a level');
      this.levels.delete(name);
    } else {
      this.levels.set(name, level);
    }
    this.effective.clear();
  }

  effectiveLevel(name: string): LogLevel {
    const cached = this.effective.get(name);
    if (cached !== undefined) return cached;
    let level = this.levels.get(ROOT)!;
    for (let n: string | null = name; n; n = n.includes('.') ? n.slice(0, n.lastIndexOf('.')) : null) {
      const explicit = this.levels.get(n);
      if (explicit !== undefined) {
        level = explicit;
        break;
      }
    }
    this.effective.set(name, level);
    return level;
  }

  isEnabled(logger: string, level: LogLevel): boolean {
    return level !== LogLevel.OFF && level >= this.effectiveLevel(logger);
  }

  emit(logger: string, level: LogLevel, message: string, fields: Record<string, unknown> = {}, error?: unknown): void {
    let record: LogRecord | null = {
      seq: ++this.seq,
      timestamp: this.now(),
      level,
      levelName: levelName(level),
      logger,
      message,
      context: LogContext.current(),
      fields,
      ...(error !== undefined && { error: toErrorInfo(error) }),
    };
    for (const p of this.processors) {
      record = p(record);
      if (!record) {
        this.stats.droppedByProcessors++;
        return;
      }
    }
    this.stats.emitted[record.levelName] = (this.stats.emitted[record.levelName] ?? 0) + 1;
    for (const a of this.appenders) {
      if (record.level < a.minLevel) continue;
      try {
        a.append(record);
      } catch {
        this.stats.appenderErrors++; // logging must never take the request down
      }
    }
  }

  flush(): void {
    this.appenders.forEach((a) => a.flush?.());
  }

  /** Every logger ever requested plus every explicitly configured name. */
  describe(): { name: string; effectiveLevel: string; explicitLevel: string | null }[] {
    const names = new Set([ROOT, ...this.levels.keys(), ...this.loggers.keys()]);
    return [...names].sort().map((name) => ({
      name,
      effectiveLevel: levelName(this.effectiveLevel(name)),
      explicitLevel: this.levels.has(name) ? levelName(this.levels.get(name)!) : null,
    }));
  }

  getStats(): LoggingStats & { appenders: { name: string; minLevel: string }[] } {
    return {
      ...this.stats,
      emitted: { ...this.stats.emitted },
      appenders: this.appenders.map((a) => ({ name: a.name, minLevel: levelName(a.minLevel) })),
    };
  }
}

function toErrorInfo(e: unknown): { name: string; message: string; stack?: string } {
  return e instanceof Error ? { name: e.name, message: e.message, stack: e.stack } : { name: 'NonError', message: String(e) };
}
