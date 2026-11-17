import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, map } from 'rxjs';

export interface SuccessBody<T> {
  success: true;
  data: T;
}

/** Wraps every successful response as { success: true, data }. */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, SuccessBody<T>> {
  intercept(_ctx: ExecutionContext, next: CallHandler<T>): Observable<SuccessBody<T>> {
    return next.handle().pipe(map((data) => ({ success: true as const, data: data ?? (null as T) })));
  }
}
