import { Clock } from '../../common/utils/clock';
import { BufferedAppender, ConsoleAppender, MemoryAppender } from './domain/appenders';
import { JsonFormatter } from './domain/formatter';
import { LogLevel } from './domain/log-level';
import { LogManager } from './domain/log-manager';
import { redactKeys } from './domain/processors';

export const LOG_MANAGER = Symbol('LOG_MANAGER');

/** Builder for the module's LogManager. Swap appenders here; nothing else changes. */
export function buildLogManager(clock: Clock, { console = true } = {}): LogManager {
  const manager = new LogManager(() => clock.date())
    .addProcessor(redactKeys(['password', 'token', 'authorization', 'cardNumber', 'cvv']))
    .addAppender(new MemoryAppender('memory', LogLevel.TRACE, 1000));
  if (console) {
    manager.addAppender(new BufferedAppender(new ConsoleAppender('console', LogLevel.INFO, new JsonFormatter()), 20, 1000, 500));
  }
  manager.setLevel('app', LogLevel.INFO);
  return manager;
}
