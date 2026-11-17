import { BufferedAppender, ConsoleAppender, MemoryAppender } from './domain/appenders';
import { JsonFormatter, TextFormatter } from './domain/formatter';
import { LogContext } from './domain/log-context';
import { LogLevel } from './domain/log-level';
import { LogManager } from './domain/log-manager';
import { dropWhen, redactKeys } from './domain/processors';

const T = new Date('2026-11-09T04:30:00.000Z');

function setup() {
  const memory = new MemoryAppender('memory', LogLevel.TRACE, 5);
  const lines: string[] = [];
  const manager = new LogManager(() => T)
    .addProcessor(redactKeys(['password', 'cardNumber']))
    .addAppender(memory)
    .addAppender(new ConsoleAppender('console', LogLevel.WARN, new TextFormatter(), (l) => lines.push(l)));
  return { manager, memory, lines };
}

describe('Logging framework', () => {
  it('getLogger returns the same instance per name', () => {
    const { manager } = setup();
    expect(manager.getLogger('app.orders')).toBe(manager.getLogger('app.orders'));
  });

  it('levels inherit down the dotted hierarchy and change at runtime', () => {
    const { manager, memory } = setup();
    const pay = manager.getLogger('app.orders.payment');
    pay.debug('hidden');                         // root INFO
    manager.setLevel('app.orders', LogLevel.DEBUG);
    pay.debug('visible');                        // inherits DEBUG from app.orders
    manager.setLevel('app.orders.payment', LogLevel.ERROR);
    pay.warn('hidden again');                    // own level wins
    manager.setLevel('app.orders.payment', null);
    pay.debug('inherits again');
    expect(memory.query().map((r) => r.message)).toEqual(['inherits again', 'visible']);
  });

  it('a disabled lazy message is never built', () => {
    const { manager } = setup();
    let built = 0;
    manager.getLogger('app').debug(() => `expensive ${++built}`);
    expect(built).toBe(0);
  });

  it('each appender has its own threshold', () => {
    const { manager, memory, lines } = setup();
    const log = manager.getLogger('app');
    log.info('to memory only');
    log.error('to both', new Error('boom'));
    expect(memory.count()).toBe(2);
    expect(lines).toEqual(['2026-11-09T04:30:00.000Z ERROR [app] to both\n  Error: boom']);
  });

  it('context follows the request through awaits; secrets are redacted', async () => {
    const { manager, memory } = setup();
    const log = manager.getLogger('app.payment');
    await LogContext.run({ requestId: 'r1' }, async () => {
      await new Promise((r) => setTimeout(r, 1));
      log.info('charging', { amount: 100, card: { cardNumber: '4111', brand: 'VISA' }, password: 'x' });
    });
    log.info('outside');
    const [outside, inside] = memory.query();
    expect(inside.context).toEqual({ requestId: 'r1' });
    expect(inside.fields).toEqual({ amount: 100, card: { cardNumber: '[REDACTED]', brand: 'VISA' }, password: '[REDACTED]' });
    expect(outside.context).toEqual({});
  });

  it('memory appender is a ring buffer: newest first, oldest overwritten', () => {
    const { manager, memory } = setup();
    for (let i = 1; i <= 7; i++) manager.getLogger('app').info(`m${i}`);
    expect(memory.query().map((r) => r.message)).toEqual(['m7', 'm6', 'm5', 'm4', 'm3']);
    expect(memory.query({ contains: 'M6' }).map((r) => r.message)).toEqual(['m6']);
  });

  it('a throwing appender is counted, never thrown to the caller', () => {
    const { manager } = setup();
    manager.addAppender({ name: 'broken', minLevel: LogLevel.TRACE, append: () => { throw new Error('disk full'); } });
    expect(() => manager.getLogger('app').info('still fine')).not.toThrow();
    expect(manager.getStats().appenderErrors).toBe(1);
  });

  it('processors can drop records', () => {
    const { manager, memory } = setup();
    manager.addProcessor(dropWhen((r) => r.message.startsWith('GET /health')));
    manager.getLogger('app.http').info('GET /health 200');
    expect(memory.count()).toBe(0);
    expect(manager.getStats().droppedByProcessors).toBe(1);
  });

  describe('BufferedAppender', () => {
    it('batches, flushes on ERROR immediately, and drops low levels (not WARN+) when full', () => {
      const out = new MemoryAppender('out', LogLevel.TRACE, 100);
      const buffered = new BufferedAppender(out, 10, 3, 0);
      const manager = new LogManager(() => T).addAppender(buffered);
      const log = manager.getLogger('app');

      log.info('a');
      log.info('b');
      expect(out.count()).toBe(0); // buffered
      log.info('c');
      log.info('d');               // queue full (3): dropped
      log.warn('w');               // kept: evicts the oldest INFO
      expect(buffered.dropped).toBe(2);
      log.error('e');              // flushes everything now
      expect(out.query().map((r) => r.message).reverse()).toEqual(['b', 'c', 'w', 'e']);
      buffered.close();
    });
  });

  it('JSON formatter merges context and fields into one object per line', () => {
    const line = new JsonFormatter().format({
      seq: 1, timestamp: T, level: LogLevel.INFO, levelName: 'INFO', logger: 'app', message: 'hi',
      context: { requestId: 'r1' }, fields: { orderId: 'o1' },
    });
    expect(JSON.parse(line)).toEqual({ ts: T.toISOString(), level: 'INFO', logger: 'app', msg: 'hi', requestId: 'r1', orderId: 'o1' });
  });
});
