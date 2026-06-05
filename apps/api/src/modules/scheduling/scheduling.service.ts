import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { Queue, Worker, Job, RepeatOptions } from 'bullmq';
import { PinoLogger, InjectPinoLogger } from 'nestjs-pino';
import { REDIS_CLIENT } from '../../common/cache/redis.provider';
import { SCHEDULING_QUEUE, asBullConnection } from '../events/dispatcher/queue.constants';

/**
 * A time-driven, idempotent, tenant-aware job (R11). Concrete jobs (period auto-rollover T058,
 * invitation expiry T036) implement this and register themselves on init. The handler is expected
 * to be a cross-tenant sweep that re-establishes RLS scope per tenant via TenancyService.
 */
export interface ScheduledJob {
  /** Unique job name; also used as the repeatable job key (idempotent scheduling). */
  readonly name: string;
  /** BullMQ repeat options: either `{ every: 60_000 }` (ms) or `{ pattern: <cron> }`. */
  readonly repeat: RepeatOptions;
  run(): Promise<void>;
}

/**
 * Scheduling infrastructure (T024). Owns one BullMQ queue + worker for repeatable jobs. Repeatable
 * jobs are keyed by name so re-registration on restart does not create duplicates (idempotent).
 */
@Injectable()
export class SchedulingService implements OnModuleInit, OnModuleDestroy {
  private queue!: Queue;
  private worker?: Worker;
  private readonly jobs = new Map<string, ScheduledJob>();

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @InjectPinoLogger(SchedulingService.name) private readonly logger: PinoLogger,
  ) {}

  /** Register a job. Call during module init (before onModuleInit completes). */
  register(job: ScheduledJob): void {
    this.jobs.set(job.name, job);
  }

  async onModuleInit(): Promise<void> {
    this.queue = new Queue(SCHEDULING_QUEUE, { connection: asBullConnection(this.redis) });

    this.worker = new Worker(
      SCHEDULING_QUEUE,
      async (job: Job) => {
        const handler = this.jobs.get(job.name);
        if (!handler) {
          this.logger.warn({ job: job.name }, 'no handler registered for scheduled job');
          return;
        }
        await handler.run();
      },
      { connection: asBullConnection(this.redis) },
    );
    this.worker.on('failed', (job, err) => {
      this.logger.error({ err, job: job?.name }, 'scheduled job failed');
    });

    // Upsert each repeatable job. `jobId` keyed on name keeps scheduling idempotent across restarts.
    for (const job of this.jobs.values()) {
      await this.queue.add(
        job.name,
        {},
        { repeat: job.repeat, jobId: job.name, removeOnComplete: true, removeOnFail: 100 },
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }
}
