import { Formatter, TextFormatter } from './formatter';
import { LogLevel } from './log-level';
import { LogRecord } from './log-record';

/**
 * Observer / sink. The manager hands every enabled record to every appender whose own
 * threshold it passes. append() must be fast and must not throw into the caller.
 */
export interface Appender {
  readonly name: string;
  minLevel: LogLevel;
  append(record: LogRecord): void;
  flush?(): void;
}

/** Writes formatted lines to a sink (stdout by default; injectable for tests). */
export class ConsoleAppender implements Appender {
  constructor(
    readonly name = 'console',
    public minLevel = LogLevel.INFO,
    private readonly formatter: Formatter = new TextFormatter(),
    private readonly write: (line: string) => void = (line) => process.stdout.write(line + '\n'),
  ) {}

  append(record: LogRecord): void {
    this.write(this.formatter.format(record));
  }
}

export interface MemoryQuery {
  minLevel?: LogLevel;
  logger?: string;
  contains?: string;
  limit?: number;
}

/** Ring buffer of the last N records: bounded memory, queryable. Backs GET /logging/entries. */
export class MemoryAppender implements Appender {
  private readonly buffer: (LogRecord | undefined)[];
  private next = 0;
  private size = 0;

  constructor(
    readonly name = 'memory',
    public minLevel = LogLevel.TRACE,
    readonly capacity = 1000,
  ) {
    this.buffer = new Array(capacity);
  }

  append(record: LogRecord): void {
    this.buffer[this.next] = record; // overwrites the oldest when full
    this.next = (this.next + 1) % this.capacity;
    this.size = Math.min(this.size + 1, this.capacity);
  }

  /** Newest first. */
  query(q: MemoryQuery = {}): LogRecord[] {
    const out: LogRecord[] = [];
    for (let i = 1; i <= this.size && out.length < (q.limit ?? 100); i++) {
      const r = this.buffer[(this.next - i + this.capacity) % this.capacity]!;
      if (q.minLevel !== undefined && r.level < q.minLevel) continue;
      if (q.logger && r.logger !== q.logger && !r.logger.startsWith(q.logger + '.')) continue;
      if (q.contains && !r.message.toLowerCase().includes(q.contains.toLowerCase())) continue;
      out.push(r);
    }
    return out;
  }

  count(): number {
    return this.size;
  }
}

/**
 * Decorator: batches records for a slow sink (file, network) so the request thread only
 * pushes to an array. Flushes when the batch is full, on an interval, or immediately for
 * ERROR and above. Bounded: when the queue is full it drops the NEW record if it is
 * below WARN, and counts it; WARN+ is always kept (it evicts the oldest low-level record).
 */
export class BufferedAppender implements Appender {
  private queue: LogRecord[] = [];
  private timer: NodeJS.Timeout | null = null;
  dropped = 0;

  constructor(
    private readonly inner: Appender,
    private readonly batchSize = 50,
    private readonly maxQueue = 1000,
    flushIntervalMs = 1000,
  ) {
    if (flushIntervalMs > 0) {
      this.timer = setInterval(() => this.flush(), flushIntervalMs);
      this.timer.unref(); // never keep the process alive just to flush logs
    }
  }

  get name() {
    return `buffered(${this.inner.name})`;
  }
  get minLevel() {
    return this.inner.minLevel;
  }
  set minLevel(level: LogLevel) {
    this.inner.minLevel = level;
  }

  append(record: LogRecord): void {
    if (record.level >= LogLevel.ERROR) {
      // Written right away (with everything queued before it), so it never needs room.
      this.queue.push(record);
      this.flush();
      return;
    }
    if (this.queue.length >= this.maxQueue) {
      if (record.level < LogLevel.WARN) {
        this.dropped++;
        return;
      }
      const i = this.queue.findIndex((r) => r.level < LogLevel.WARN);
      if (i >= 0) {
        this.queue.splice(i, 1);
        this.dropped++;
      } else {
        this.flush(); // queue is all WARN+: write it out rather than lose any
      }
    }
    this.queue.push(record);
    if (this.queue.length >= this.batchSize) this.flush();
  }

  flush(): void {
    const batch = this.queue;
    this.queue = [];
    batch.forEach((r) => this.inner.append(r));
    this.inner.flush?.();
  }

  pending(): number {
    return this.queue.length;
  }

  close(): void {
    if (this.timer) clearInterval(this.timer);
    this.flush();
  }
}
