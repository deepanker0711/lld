import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'rateLimit';

/**
 * Put on a controller or a route: @RateLimit('search').
 * RateLimitGuard (registered globally) reads it; routes without it are not limited.
 */
export const RateLimit = (ruleKey: string) => SetMetadata(RATE_LIMIT_KEY, ruleKey);
