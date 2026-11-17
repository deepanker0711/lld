import { Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { Clock } from '../../common/utils/clock';
import { LogManager } from './domain/log-manager';
import { LogContextInterceptor } from './log-context.interceptor';
import { LoggingController } from './logging.controller';
import { buildLogManager, LOG_MANAGER } from './logging.providers';

@Module({
  controllers: [LoggingController],
  providers: [
    // Singleton by Nest's default scope: one LogManager for the app, injectable anywhere.
    { provide: LOG_MANAGER, useFactory: (clock: Clock) => buildLogManager(clock, { console: process.env.LOG_CONSOLE !== 'off' }), inject: [Clock] },
    LogContextInterceptor,
  ],
  exports: [LOG_MANAGER],
})
export class LoggingFrameworkModule implements OnApplicationShutdown {
  constructor(@Inject(LOG_MANAGER) private readonly logs: LogManager) {}

  /** Buffered lines are written before exit. */
  onApplicationShutdown(): void {
    this.logs.flush();
  }
}
