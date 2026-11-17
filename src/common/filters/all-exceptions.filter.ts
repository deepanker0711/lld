import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { DomainError } from '../errors/domain.errors';

export interface ErrorBody {
  success: false;
  error: { code: string; message: string; details?: unknown };
  path: string;
  timestamp: string;
}

/**
 * One place that turns any thrown error into the same JSON shape:
 *   { success: false, error: { code, message, details? }, path, timestamp }
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    const { status, code, message, details } = this.normalize(exception);
    if (status >= 500) this.logger.error(exception);

    const body: ErrorBody = {
      success: false,
      error: { code, message, ...(details !== undefined && { details }) },
      path: req.url,
      timestamp: new Date().toISOString(),
    };
    res.status(status).json(body);
  }

  private normalize(exception: unknown) {
    if (exception instanceof DomainError) {
      return {
        status: exception.httpStatus,
        code: exception.code,
        message: exception.message,
        details: exception.details,
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      // ValidationPipe throws BadRequestException with message: string[]
      const raw = typeof response === 'object' ? (response as { message?: unknown }).message : response;
      const isValidation = Array.isArray(raw);
      return {
        status,
        code: isValidation ? 'VALIDATION_FAILED' : (HttpStatus[status] ?? 'ERROR'),
        message: isValidation ? 'Validation failed' : String(raw ?? exception.message),
        details: isValidation ? raw : undefined,
      };
    }

    return {
      status: 500,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Something went wrong',
      details: undefined,
    };
  }
}
