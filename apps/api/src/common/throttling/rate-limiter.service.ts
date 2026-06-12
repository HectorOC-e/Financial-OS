/**
 * Redis fixed-window rate limiter (T109 — design-gate CHK027).
 *
 * One INCR + EXPIRE per check, keyed `rl:{bucket}:{principal}:{window}`. Counting is shared across
 * API instances (horizontal scaling) because the window lives in Redis, not process memory.
 *
 * Fail-open by design: if Redis is unreachable or slow (> CHECK_TIMEOUT_MS), the request is allowed
 * and a warning is logged — rate limiting is abuse prevention, not a correctness control, so it must
 * never take the API down with it.
 */
import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger, InjectPinoLogger } from 'nestjs-pino';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../cache/redis.provider';

const CHECK_TIMEOUT_MS = 100;

export interface RateLimitDecision {
  allowed: boolean;
  /** Requests left in the current window (0 when rejected). */
  remaining: number;
  /** Seconds until the window resets — clients should back off this long. */
  retryAfterSeconds: number;
}

export interface RateLimitRule {
  /** Logical bucket name (e.g. 'mutation', 'coaching') — part of the Redis key. */
  bucket: string;
  /** Maximum requests per window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
}

@Injectable()
export class RateLimiterService {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @InjectPinoLogger(RateLimiterService.name) private readonly logger: PinoLogger,
  ) {}

  /** Count one request for `principalKey` against `rule`; never throws (fail-open). */
  async check(rule: RateLimitRule, principalKey: string): Promise<RateLimitDecision> {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const window = Math.floor(nowSeconds / rule.windowSeconds);
    const key = `rl:${rule.bucket}:${principalKey}:${window}`;
    const retryAfterSeconds = (window + 1) * rule.windowSeconds - nowSeconds;

    try {
      const count = await this.withTimeout(this.incrementWithExpiry(key, rule.windowSeconds));
      if (count > rule.limit) {
        return { allowed: false, remaining: 0, retryAfterSeconds };
      }
      return { allowed: true, remaining: rule.limit - count, retryAfterSeconds };
    } catch (err) {
      this.logger.warn({ err, bucket: rule.bucket }, 'Rate limiter unavailable; failing open');
      return { allowed: true, remaining: rule.limit, retryAfterSeconds };
    }
  }

  private async incrementWithExpiry(key: string, windowSeconds: number): Promise<number> {
    const count = await this.redis.incr(key);
    if (count === 1) {
      // First hit in this window: bound the key's lifetime (window + slack for clock skew).
      await this.redis.expire(key, windowSeconds + 1);
    }
    return count;
  }

  private withTimeout<T>(work: Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('rate-limit check timed out')), CHECK_TIMEOUT_MS);
      work.then(
        (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        (e) => {
          clearTimeout(timer);
          reject(e);
        },
      );
    });
  }
}
