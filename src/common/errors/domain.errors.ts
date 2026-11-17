/**
 * Domain errors are plain classes with no Nest/HTTP imports, so services stay
 * framework-free. AllExceptionsFilter maps `httpStatus` to the response.
 */
export abstract class DomainError extends Error {
  abstract readonly httpStatus: number;
  abstract readonly code: string;

  constructor(
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class BadRequestError extends DomainError {
  readonly httpStatus = 400;
  readonly code = 'BAD_REQUEST';
}

export class UnauthorizedError extends DomainError {
  readonly httpStatus = 401;
  readonly code = 'UNAUTHORIZED';
}

export class ForbiddenError extends DomainError {
  readonly httpStatus = 403;
  readonly code = 'FORBIDDEN';
}

export class NotFoundError extends DomainError {
  readonly httpStatus = 404;
  readonly code = 'NOT_FOUND';

  constructor(entity: string, id?: string) {
    super(id === undefined ? `${entity} not found` : `${entity} '${id}' not found`);
  }
}

/** Duplicate key, slot already taken, invalid state transition, etc. */
export class ConflictError extends DomainError {
  readonly httpStatus = 409;
  readonly code = 'CONFLICT';
}

/** Valid request that breaks a business rule (e.g. insufficient leave balance). */
export class UnprocessableError extends DomainError {
  readonly httpStatus = 422;
  readonly code = 'UNPROCESSABLE';
}

export class TooManyRequestsError extends DomainError {
  readonly httpStatus = 429;
  readonly code = 'TOO_MANY_REQUESTS';
}

/** Resource existed but is no longer available (e.g. expired short link). */
export class GoneError extends DomainError {
  readonly httpStatus = 410;
  readonly code = 'GONE';
}
