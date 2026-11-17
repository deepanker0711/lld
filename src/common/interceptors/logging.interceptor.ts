import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';

/** Logs `GET /caches/x 200 3ms` per request. Errors are logged by the exception filter. */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const start = Date.now();
    return next.handle().pipe(
      tap(() => {
        const res = ctx.switchToHttp().getResponse<Response>();
        this.logger.log(`${req.method} ${req.url} ${res.statusCode} ${Date.now() - start}ms`);
      }),
    );
  }
}
