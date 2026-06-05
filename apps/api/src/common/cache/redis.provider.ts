import { Provider } from '@nestjs/common';
import IORedis, { Redis } from 'ioredis';

/** DI token for the shared ioredis connection (cache + BullMQ). */
export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

export const redisProvider: Provider = {
  provide: REDIS_CLIENT,
  useFactory: (): Redis =>
    // `maxRetriesPerRequest: null` is required when the same connection backs BullMQ workers.
    new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
    }),
};
