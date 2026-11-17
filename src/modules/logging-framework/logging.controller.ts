import { Body, Controller, Get, Inject, NotFoundException, Param, Post, Put, Query, UseInterceptors } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { BadRequestError } from '../../common/errors/domain.errors';
import { sleep } from '../../common/utils/sleep';
import { MemoryAppender } from './domain/appenders';
import { LogContext } from './domain/log-context';
import { LogLevel } from './domain/log-level';
import { LogManager } from './domain/log-manager';
import { DemoCheckoutDto, EntriesQuery, SetLevelDto, WriteLogDto } from './dto/dto';
import { LogContextInterceptor } from './log-context.interceptor';
import { LOG_MANAGER } from './logging.providers';

@ApiTags('Logging Framework')
@Controller('logging')
@UseInterceptors(LogContextInterceptor)
export class LoggingController {
  constructor(@Inject(LOG_MANAGER) private readonly logs: LogManager) {}

  @Get('loggers')
  loggers() {
    return this.logs.describe();
  }

  /** Runtime level change, no restart: e.g. DEBUG on app.payment while investigating. */
  @Put('loggers/:name/level')
  setLevel(@Param('name') name: string, @Body() dto: SetLevelDto) {
    try {
      this.logs.getLogger(name);
      this.logs.setLevel(name, dto.level === null ? null : LogLevel[dto.level]);
    } catch (e) {
      throw new BadRequestError((e as Error).message);
    }
    return this.logs.describe().find((l) => l.name === name);
  }

  @Post('logs')
  write(@Body() dto: WriteLogDto) {
    const logger = this.logs.getLogger(dto.logger);
    const level = LogLevel[dto.level];
    const written = logger.isEnabled(level);
    if (written) this.logs.emit(dto.logger, level, dto.message, dto.fields ?? {});
    return { written, effectiveLevel: LogLevel[this.logs.effectiveLevel(dto.logger)] };
  }

  @Get('entries')
  entries(@Query() q: EntriesQuery) {
    const records = this.memory().query({
      minLevel: q.level ? LogLevel[q.level] : undefined,
      logger: q.logger,
      contains: q.contains,
      limit: q.requestId ? 1000 : q.limit,
    });
    return q.requestId ? records.filter((r) => r.context.requestId === q.requestId).slice(0, q.limit) : records;
  }

  @Get('stats')
  stats() {
    return { ...this.logs.getStats(), buffered: this.memory().count() };
  }

  /**
   * A fake request flow across three loggers. Every line carries the same requestId
   * without anyone passing it, across awaits; the card number is redacted.
   */
  @Post('demo/checkout')
  async demo(@Body() dto: DemoCheckoutDto) {
    const http = this.logs.getLogger('app.http');
    const orders = this.logs.getLogger('app.orders');
    const payment = this.logs.getLogger('app.payment');

    http.info('POST /checkout received');
    orders.debug(() => `validating cart ${JSON.stringify({ lines: 3 })}`); // built only if DEBUG is on
    LogContext.set('userId', 'usr_42');
    await sleep(5);
    payment.info('charging card', { amountPaise: 1_770_00, cardNumber: '4111111111111111' });
    await sleep(5);
    if (dto.fail) payment.error('charge failed', new Error('Gateway timeout'), { gateway: 'fake' });
    else orders.info('order confirmed', { orderId: 'ord_1' });
    http.info(`POST /checkout → ${dto.fail ? 502 : 201}`);

    const requestId = LogContext.current().requestId as string;
    return { requestId, lines: this.memory().query({ limit: 1000 }).filter((r) => r.context.requestId === requestId).reverse() };
  }

  private memory(): MemoryAppender {
    const m = this.logs.getAppender<MemoryAppender>('memory');
    if (!m) throw new NotFoundException('memory appender is not configured');
    return m;
  }
}
