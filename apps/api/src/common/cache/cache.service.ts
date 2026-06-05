import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from './redis.provider';

/**
 * Read-through cache for derived analytics (standings, pool totals) — R8.
 *
 * Keys are namespaced `tenantId:profileId[:periodId]` so event-driven invalidation (T062/T072)
 * can purge a whole profile or a single period precisely. The short TTL is only a fallback ceiling;
 * the primary freshness mechanism (SC-007 ≤5s) is event-driven invalidation. Authoritative money
 * writes never read from cache.
 */
@Injectable()
export class CacheService {
  /** Fallback TTL (seconds) for derived analytics; event invalidation is the primary path. */
  static readonly DERIVED_TTL_SECONDS = 30;

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  key(tenantId: string, profileId: string, periodId?: string): string {
    return periodId ? `${tenantId}:${profileId}:${periodId}` : `${tenantId}:${profileId}`;
  }

  async get<T>(key: string): Promise<T | null> {
    const raw = await this.redis.get(key);
    return raw === null ? null : (JSON.parse(raw) as T);
  }

  async set<T>(key: string, value: T, ttlSeconds = CacheService.DERIVED_TTL_SECONDS): Promise<void> {
    await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  }

  async del(key: string): Promise<void> {
    await this.redis.del(key);
  }

  /** Invalidate every cached projection for a profile (and its periods). */
  async invalidateProfile(tenantId: string, profileId: string): Promise<void> {
    await this.deleteByPattern(`${tenantId}:${profileId}*`);
  }

  /** Invalidate cached projections for a single period. */
  async invalidatePeriod(tenantId: string, profileId: string, periodId: string): Promise<void> {
    await this.del(this.key(tenantId, profileId, periodId));
  }

  private async deleteByPattern(pattern: string): Promise<void> {
    const stream = this.redis.scanStream({ match: pattern, count: 100 });
    const pipeline = this.redis.pipeline();
    let queued = 0;
    for await (const keys of stream as AsyncIterable<string[]>) {
      for (const k of keys) {
        pipeline.del(k);
        queued++;
      }
    }
    if (queued > 0) {
      await pipeline.exec();
    }
  }
}
