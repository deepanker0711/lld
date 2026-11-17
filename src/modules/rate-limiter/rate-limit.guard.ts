import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request, Response } from 'express';
import { TooManyRequestsError } from '../../common/errors/domain.errors';
import { RATE_LIMIT_KEY } from './rate-limit.decorator';
import { RateLimiterService } from './rate-limiter.service';

/**
 * Guards run after middleware and before pipes/handlers, so a blocked request
 * never reaches validation or business logic.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly limiter: RateLimiterService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const ruleKey = this.reflector.getAllAndOverride<string | undefined>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!ruleKey) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    // Real systems key on the authenticated user / API key. Behind a proxy, req.ip
    // needs app.set('trust proxy', ...) or every client looks like the load balancer.
    const clientId = req.header('x-client-id') ?? req.ip ?? 'unknown';

    const decision = this.limiter.check(ruleKey, clientId);
    if (!decision) {
      this.logger.warn(`No rate limit rule '${ruleKey}', allowing request`);
      return true;
    }

    res.setHeader('X-RateLimit-Limit', decision.limit);
    res.setHeader('X-RateLimit-Remaining', decision.remaining);
    res.setHeader('X-RateLimit-Reset', Math.ceil(decision.resetAfterMs / 1000));

    if (!decision.allowed) {
      const retryAfterSec = Math.ceil(decision.retryAfterMs / 1000);
      res.setHeader('Retry-After', retryAfterSec);
      throw new TooManyRequestsError(`Rate limit '${ruleKey}' exceeded, retry in ${retryAfterSec}s`, {
        rule: ruleKey,
        retryAfterMs: decision.retryAfterMs,
      });
    }
    return true;
  }
}
