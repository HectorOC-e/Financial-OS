import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { Queue } from 'bullmq';
import { PinoLogger, InjectPinoLogger } from 'nestjs-pino';
import { REDIS_CLIENT } from '../../../common/cache/redis.provider';
import { PrismaService } from '../../../common/persistence/prisma.service';
import { DomainEventEnvelope } from '../event-envelope';
import { DOMAIN_EVENTS_QUEUE, asBullConnection } from './queue.constants';

/**
 * Outbox → BullMQ relay (R4 / T022).
 *
 * Polls undispatched `OutboxEvent` rows and enqueues each to the domain-events queue, then marks it
 * dispatched. Idempotency: the BullMQ `jobId` is the event id, so re-enqueuing the same event is a
 * no-op (re-delivery safe). Tenant context propagates via the envelope `tenantId`, which consumers
 * use to re-establish RLS scope (T023).
 */
@Injectable()
export class OutboxDispatcher implements OnModuleInit, OnModuleDestroy {
  private queue!: Queue;
  private timer?: NodeJS.Timeout;
  private readonly pollMs = 1000;
  private running = false;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly prisma: PrismaService,
    @InjectPinoLogger(OutboxDispatcher.name) private readonly logger: PinoLogger,
  ) {}

  onModuleInit(): void {
    this.queue = new Queue(DOMAIN_EVENTS_QUEUE, { connection: asBullConnection(this.redis) });
    this.timer = setInterval(() => void this.dispatchPending(), this.pollMs);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.queue?.close();
  }

  /**
   * Relay a batch of pending events. Safe to call concurrently — the `dispatchedAt` guard plus the
   * deterministic `jobId` make double-dispatch harmless.
   */
  async dispatchPending(batchSize = 100): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const pending = await this.prisma.outboxEvent.findMany({
        where: { dispatchedAt: null },
        orderBy: { occurredAt: 'asc' },
        take: batchSize,
      });

      for (const row of pending) {
        const payload = (row.payload ?? {}) as Record<string, unknown>;
        const actorMembershipId =
          typeof payload.actorMembershipId === 'string' ? payload.actorMembershipId : null;

        const envelope: DomainEventEnvelope = {
          eventId: row.id,
          eventType: row.eventType,
          schemaVersion: row.schemaVersion,
          tenantId: row.tenantId,
          aggregateType: row.aggregateType,
          aggregateId: row.aggregateId,
          occurredAt: row.occurredAt.toISOString(),
          actorMembershipId,
          payload,
        };

        await this.queue.add(row.eventType, envelope, {
          jobId: row.id, // idempotency key — duplicate adds are ignored by BullMQ
          removeOnComplete: true,
          removeOnFail: false,
          attempts: 5,
          backoff: { type: 'exponential', delay: 1000 },
        });

        await this.prisma.outboxEvent.update({
          where: { id: row.id },
          data: { dispatchedAt: new Date() },
        });
      }

      if (pending.length > 0) {
        this.logger.debug({ count: pending.length }, 'dispatched outbox events');
      }
      return pending.length;
    } catch (err) {
      this.logger.error({ err }, 'outbox dispatch failed');
      return 0;
    } finally {
      this.running = false;
    }
  }
}
