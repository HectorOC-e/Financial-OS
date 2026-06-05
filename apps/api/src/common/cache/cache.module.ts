import { Global, Module } from '@nestjs/common';
import { redisProvider, REDIS_CLIENT } from './redis.provider';
import { CacheService } from './cache.service';

/** Global Redis + cache layer (R8). The raw client is exported for the BullMQ infra (events/scheduling). */
@Global()
@Module({
  providers: [redisProvider, CacheService],
  exports: [REDIS_CLIENT, CacheService],
})
export class CacheModule {}
