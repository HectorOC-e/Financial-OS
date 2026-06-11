/**
 * Period auto-rollover repeatable job (T058 — FR-016a). Closes due periods and opens their successors
 * with a fresh snapshot, forward-only. Same RLS-safe two-level shape as the invitation-expiry job:
 * `run` discovers tenants with due periods via the background path (PrismaService, like the
 * OutboxDispatcher) and delegates the actual close/open work to PeriodService.rolloverForTenant,
 * which runs entirely inside a per-tenant transaction.
 */
import { Injectable } from '@nestjs/common';
import { PinoLogger, InjectPinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../../../common/persistence/prisma.service';
import { SchedulingService, ScheduledJob } from '../../../scheduling/scheduling.service';
import { PeriodService } from '../period.service';

@Injectable()
export class PeriodRolloverJob implements ScheduledJob {
  readonly name = 'period-rollover';
  /** Every 15 minutes; idempotent, so a period closes within one tick of its end (FR-016a). */
  readonly repeat = { every: 15 * 60 * 1000 };

  constructor(
    private readonly prisma: PrismaService,
    private readonly periods: PeriodService,
    scheduling: SchedulingService,
    @InjectPinoLogger(PeriodRolloverJob.name) private readonly logger: PinoLogger,
  ) {
    scheduling.register(this);
  }

  async run(): Promise<void> {
    const now = new Date();
    const due = await this.prisma.contributionPeriod.findMany({
      where: { status: 'OPEN', endDate: { lte: now } },
      select: { tenantId: true },
      distinct: ['tenantId'],
      take: 1000,
    });
    let rolled = 0;
    for (const { tenantId } of due) {
      rolled += await this.periods.rolloverForTenant(tenantId);
    }
    if (rolled > 0) this.logger.info({ rolled }, 'rolled over contribution periods');
  }
}
