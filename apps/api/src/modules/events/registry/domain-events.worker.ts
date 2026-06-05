import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { Worker, Job } from 'bullmq';
import { PinoLogger, InjectPinoLogger } from 'nestjs-pino';
import { REDIS_CLIENT } from '../../../common/cache/redis.provider';
import { DomainEventEnvelope } from '../event-envelope';
import { DOMAIN_EVENTS_QUEUE, asBullConnection } from '../dispatcher/queue.constants';
import { EventRegistry } from './event-registry';

/**
 * BullMQ worker that consumes the domain-events queue and fans each event out to its registered
 * handlers (T023). Per-handler idempotency: a Redis `SET key NX` keyed on `handler:eventId` ensures
 * a handler runs at most once per event even across re-delivery/replay. A handler that throws lets
 * BullMQ retry (the idempotency key is only written on success).
 */
@Injectable()
export class DomainEventsWorker implements OnModuleInit, OnModuleDestroy {
  private worker?: Worker;
  /** Idempotency markers expire after 7 days — long enough to cover retry/replay windows. */
  private readonly idempotencyTtlSeconds = 60 * 60 * 24 * 7;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly registry: EventRegistry,
    @InjectPinoLogger(DomainEventsWorker.name) private readonly logger: PinoLogger,
  ) {}

  onModuleInit(): void {
    this.worker = new Worker(
      DOMAIN_EVENTS_QUEUE,
      async (job: Job<DomainEventEnvelope>) => this.process(job.data),
      { connection: asBullConnection(this.redis) },
    );
    this.worker.on('failed', (job, err) => {
      this.logger.error({ err, eventId: job?.data?.eventId }, 'event handler failed');
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }

  private async process(envelope: DomainEventEnvelope): Promise<void> {
    const handlers = this.registry.handlersFor(envelope.eventType);
    for (const handler of handlers) {
      const key = `processed:${handler.name}:${envelope.eventId}`;
      // NX => only the first delivery for this (handler,event) proceeds.
      const claimed = await this.redis.set(key, '1', 'EX', this.idempotencyTtlSeconds, 'NX');
      if (claimed !== 'OK') {
        continue; // already processed by this handler
      }
      try {
        await handler.handle(envelope);
      } catch (err) {
        // Roll back the claim so BullMQ's retry can reprocess this handler.
        await this.redis.del(key);
        throw err;
      }
    }
  }
}
