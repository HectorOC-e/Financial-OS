import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { RateLimiterService } from './rate-limiter.service';
import { RateLimitGuard } from './rate-limit.guard';

/**
 * Abuse-prevention layer (T109 — CHK027): Redis-backed fixed-window rate limiting for all GraphQL
 * mutations and the OpenRouter-backed coaching query. Registered globally so every mutation is
 * covered by default; limits are env-tunable and the limiter fails open if Redis is unavailable.
 */
@Global()
@Module({
  providers: [RateLimiterService, { provide: APP_GUARD, useClass: RateLimitGuard }],
  exports: [RateLimiterService],
})
export class ThrottlingModule {}
