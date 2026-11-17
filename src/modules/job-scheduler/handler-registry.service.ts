import { Inject, Injectable } from '@nestjs/common';
import { BadRequestError } from '../../common/errors/domain.errors';
import { JOB_HANDLERS, type JobHandler } from './domain/job-handler';

/**
 * Registry: type → handler. Built once at startup from every JobHandler provider.
 * POST /jobs calls get() to reject unknown types with 400 before anything is scheduled.
 */
@Injectable()
export class HandlerRegistry {
  private readonly handlers = new Map<string, JobHandler>();

  constructor(@Inject(JOB_HANDLERS) handlers: JobHandler[]) {
    for (const handler of handlers) {
      // Programmer error, not a user error: crash at boot instead of picking one silently.
      if (this.handlers.has(handler.type)) {
        throw new Error(`Duplicate job handler for type '${handler.type}'`);
      }
      this.handlers.set(handler.type, handler);
    }
  }

  has(type: string): boolean {
    return this.handlers.has(type);
  }

  get(type: string): JobHandler {
    const handler = this.handlers.get(type);
    if (!handler) {
      throw new BadRequestError(`Unknown job type '${type}'`, {
        knownTypes: this.types(),
      });
    }
    return handler;
  }

  types(): string[] {
    return [...this.handlers.keys()];
  }
}
