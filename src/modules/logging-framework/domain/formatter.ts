import { LogRecord } from './log-record';

/** Strategy: how a record becomes a line. */
export interface Formatter {
  format(record: LogRecord): string;
}

/** 2026-11-09T10:00:00.000Z INFO  [app.orders] placed order {requestId=r1} {orderId=o1} */
export class TextFormatter implements Formatter {
  format(r: LogRecord): string {
    const kv = (o: Readonly<Record<string, unknown>>) => {
      const parts = Object.entries(o).map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`);
      return parts.length ? ` {${parts.join(' ')}}` : '';
    };
    const err = r.error ? `\n  ${r.error.name}: ${r.error.message}` : '';
    return `${r.timestamp.toISOString()} ${r.levelName.padEnd(5)} [${r.logger}] ${r.message}${kv(r.context)}${kv(r.fields)}${err}`;
  }
}

/** One JSON object per line: what log shippers (Fluent Bit, Vector) and ELK/Loki expect. */
export class JsonFormatter implements Formatter {
  format(r: LogRecord): string {
    return JSON.stringify({
      ts: r.timestamp.toISOString(),
      level: r.levelName,
      logger: r.logger,
      msg: r.message,
      ...r.context,
      ...r.fields,
      ...(r.error && { error: r.error }),
    });
  }
}
