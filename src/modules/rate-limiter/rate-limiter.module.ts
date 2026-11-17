import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { RateLimitGuard } from './rate-limit.guard';
import { LimitedDemoController, RateLimiterController } from './rate-limiter.controller';
import { RateLimiterService } from './rate-limiter.service';

@Module({
  controllers: [RateLimiterController, LimitedDemoController],
  providers: [
    RateLimiterService,
    // Global guard: any route in any module can opt in with @RateLimit('<rule>').
    { provide: APP_GUARD, useClass: RateLimitGuard },
  ],
  exports: [RateLimiterService],
})
export class RateLimiterModule {}
