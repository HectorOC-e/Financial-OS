import type { Redis } from 'ioredis';
import type { ConnectionOptions } from 'bullmq';

/** BullMQ queue names shared by the dispatcher (producer) and consumers (workers). */
export const DOMAIN_EVENTS_QUEUE = 'domain-events';
export const SCHEDULING_QUEUE = 'scheduling';

/**
 * BullMQ bundles its own ioredis copy, so a shared ioredis instance and BullMQ's `ConnectionOptions`
 * resolve to structurally-identical-but-nominally-different types. BullMQ accepts the instance fine at
 * runtime; this cast bridges the type mismatch in one place.
 */
export const asBullConnection = (redis: Redis): ConnectionOptions =>
  redis as unknown as ConnectionOptions;
