/**
 * Invitation-expiry repeatable job (T036 — FR-002a).
 *
 * Sweeps unanswered invitations whose 14-day window has elapsed (INVITED → EXPIRED). Runs on the
 * shared scheduling infrastructure (T024); registers itself in the constructor so it is known before
 * SchedulingService wires the BullMQ repeatable on init.
 *
 * Two-level design for RLS correctness:
 *   - `runForTenant` does both the due-invitation enumeration AND the writes inside one tenant-scoped
 *     transaction, so PostgreSQL RLS (and its WITH CHECK) is satisfied throughout. The status change,
 *     the InvitationExpired event (outbox), and the audit row commit atomically.
 *   - `run` discovers which tenants have work via the background path (PrismaService, mirroring the
 *     OutboxDispatcher) and delegates to `runForTenant` per tenant.
 * The conditional `updateMany ... WHERE status = 'INVITED'` makes the sweep race-safe against a
 * concurrent accept/decline.
 */
import { Injectable } from '@nestjs/common';
import { PinoLogger, InjectPinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../../../common/persistence/prisma.service';
import { TenancyService } from '../../../tenancy/tenancy.service';
import { SchedulingService, ScheduledJob } from '../../../scheduling/scheduling.service';
import { OutboxWriter } from '../../../events/outbox/outbox.writer';
import { EventType } from '../../../events/event-envelope';
import { AuditWriter } from '../../../permissions/audit/audit.writer';
import { isErr } from '../../../../common/errors';
import { expire } from '../../domain/entities/membership';
import { toMembershipState } from '../../infrastructure/membership.repository';

@Injectable()
export class InvitationExpiryJob implements ScheduledJob {
  readonly name = 'invitation-expiry';
  /** Hourly is ample for a 14-day deadline; idempotent so cadence is not load-bearing. */
  readonly repeat = { every: 60 * 60 * 1000 };

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenancy: TenancyService,
    private readonly outbox: OutboxWriter,
    private readonly audit: AuditWriter,
    scheduling: SchedulingService,
    @InjectPinoLogger(InvitationExpiryJob.name) private readonly logger: PinoLogger,
  ) {
    scheduling.register(this);
  }

  async run(): Promise<void> {
    const now = new Date();
    // Background discovery of tenants with due invitations (cross-tenant), like the OutboxDispatcher.
    const due = await this.prisma.membership.findMany({
      where: { status: 'INVITED', invitationExpiresAt: { lte: now } },
      select: { tenantId: true },
      distinct: ['tenantId'],
      take: 1000,
    });
    let expired = 0;
    for (const { tenantId } of due) {
      expired += await this.runForTenant(tenantId);
    }
    if (expired > 0) this.logger.info({ expired }, 'expired unanswered invitations');
  }

  /** RLS-safe per-tenant sweep. Returns the number of invitations expired. */
  async runForTenant(tenantId: string): Promise<number> {
    return this.tenancy.withTenant(tenantId, async (tx) => {
      const now = new Date();
      const dueRows = await tx.membership.findMany({
        where: { status: 'INVITED', invitationExpiresAt: { lte: now } },
        take: 500,
      });
      let expired = 0;
      for (const row of dueRows) {
        if (isErr(expire(toMembershipState(row), now))) continue;
        const res = await tx.membership.updateMany({
          where: { id: row.id, status: 'INVITED' },
          data: { status: 'EXPIRED' },
        });
        if (res.count === 0) continue; // raced with accept/decline
        await this.outbox.write(tx, tenantId, {
          eventType: EventType.InvitationExpired,
          aggregateType: 'Membership',
          aggregateId: row.id,
          actorMembershipId: null,
          payload: { sharedProfileId: row.sharedProfileId, userId: row.userId },
        });
        await this.audit.write(tx, tenantId, {
          sharedProfileId: row.sharedProfileId,
          actorMembershipId: null,
          action: 'InvitationExpired',
          beforeValue: { status: 'INVITED' },
          afterValue: { status: 'EXPIRED' },
        });
        expired += 1;
      }
      return expired;
    });
  }
}
