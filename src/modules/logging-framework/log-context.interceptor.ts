import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { generateId } from '../../common/utils/id.generator';
import { LogContext } from './domain/log-context';

/**
 * Starts the request's LogContext. Subscribing inside LogContext.run keeps the context
 * alive through the handler's awaits (AsyncLocalStorage follows the async chain).
 */
@Injectable()
export class LogContextInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const res = ctx.switchToHttp().getResponse<Response>();
    const requestId = req.header('x-request-id') ?? generateId('req');
    res.setHeader('x-request-id', requestId);
    return new Observable((subscriber) =>
      LogContext.run({ requestId, method: req.method, path: req.path }, () => next.handle().subscribe(subscriber)),
    );
  }
}
