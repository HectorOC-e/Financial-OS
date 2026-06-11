/**
 * Period lifecycle service (T058/T059 support — FR-016a/R7).
 *
 * Owns opening, snapshotting, and auto-rolling contribution periods. A period freezes the active plan
 * version and each active member's declared income at open time; expected amounts derive from that
 * snapshot so later edits are forward-only. Opening/closing emit ContributionPeriodOpened/Closed via
 * the outbox in the same transaction as the state change (R4).
 */
import { Injectable } from '@nestjs/common';
import type { ContributionPeriod, Prisma } from '@prisma/client';
import type { TenantTx } from '../../tenancy/tenancy.service';
import { TenancyService } from '../../tenancy/tenancy.service';
import { OutboxWriter } from '../../events/outbox/outbox.writer';
import { EventType } from '../../events/event-envelope';
import { ContributionRepository } from '../infrastructure/contribution.repository';
import {
  MemberSnapshot,
  PeriodLength,
  firstPeriodWindow,
  isPeriodDue,
  nextPeriodWindow,
  reconcile,
} from '../domain/contribution-period';

@Injectable()
export class PeriodService {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly repo: ContributionRepository,
    private readonly outbox: OutboxWriter,
  ) {}

  /** Return the open period for a profile, opening the first one (now-anchored) if none exists. */
  async ensureOpenPeriod(
    tx: TenantTx,
    tenantId: string,
    profile: { id: string; periodLength: PeriodLength },
    now: Date,
  ): Promise<ContributionPeriod> {
    const open = await this.repo.openPeriod(tx, profile.id);
    if (open) return open;
    const window = firstPeriodWindow(now, profile.periodLength);
    return this.openPeriod(tx, tenantId, profile.id, window.startDate, window.endDate);
  }

  /** Open a period: snapshot the current plan version + active members' declared income, then emit. */
  async openPeriod(
    tx: TenantTx,
    tenantId: string,
    sharedProfileId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<ContributionPeriod> {
    const plan = await this.repo.currentPlan(tx, sharedProfileId);
    const planVersion = plan?.version ?? 0;
    const members = await this.repo.activeMemberships(tx, sharedProfileId);
    const incomeSnapshot: Record<string, string> = {};
    for (const m of members) incomeSnapshot[m.id] = m.declaredIncomeCents.toString();

    const period = await this.repo.createPeriod(
      tx,
      tenantId,
      sharedProfileId,
      startDate,
      endDate,
      planVersion,
      incomeSnapshot as Prisma.InputJsonValue,
    );
    await this.outbox.write(tx, tenantId, {
      eventType: EventType.ContributionPeriodOpened,
      aggregateType: 'ContributionPeriod',
      aggregateId: period.id,
      actorMembershipId: null,
      payload: { sharedProfileId, startDate: startDate.toISOString(), endDate: endDate.toISOString(), planVersionSnapshot: planVersion },
    });
    return period;
  }

  /** Build the per-member snapshot (income × plan-version percentage) for a period's standings/pool. */
  async snapshotMembers(tx: TenantTx, period: ContributionPeriod): Promise<MemberSnapshot[]> {
    const income = (period.incomeSnapshot ?? {}) as Record<string, string>;
    const plan = await this.repo.planByVersion(tx, period.sharedProfileId, period.planVersionSnapshot);
    const allocations = plan ? await this.repo.listAllocations(tx, plan.id) : [];
    const bpByMember = new Map(allocations.map((a) => [a.membershipId, a.percentageBp]));
    return Object.entries(income).map(([membershipId, cents]) => ({
      membershipId,
      incomeCents: BigInt(cents),
      percentageBp: bpByMember.get(membershipId) ?? 0,
    }));
  }

  /** Tenant-scoped auto-rollover sweep (FR-016a): close every due period and open its successor. */
  async rolloverForTenant(tenantId: string): Promise<number> {
    return this.tenancy.withTenant(tenantId, async (tx) => {
      const now = new Date();
      const due = await this.repo.duePeriods(tx, now);
      let rolled = 0;
      for (const period of due) {
        if (!isPeriodDue(period.endDate, now)) continue;
        const actual = await this.repo.actualByMember(tx, period.id);
        const members = await this.snapshotMembers(tx, period);
        const { poolActualCents } = reconcile(members, actual);

        await this.repo.closePeriod(tx, period.id);
        await this.outbox.write(tx, tenantId, {
          eventType: EventType.ContributionPeriodClosed,
          aggregateType: 'ContributionPeriod',
          aggregateId: period.id,
          actorMembershipId: null,
          payload: { sharedProfileId: period.sharedProfileId, reconciledTotalCents: poolActualCents.toString() },
        });

        const profile = await tx.sharedProfile.findUnique({ where: { id: period.sharedProfileId } });
        if (!profile || profile.status !== 'ACTIVE') continue; // archived profiles do not re-open (FR-007c)
        const window = nextPeriodWindow(period.endDate, profile.periodLength as PeriodLength);
        await this.openPeriod(tx, tenantId, period.sharedProfileId, window.startDate, window.endDate);
        rolled += 1;
      }
      return rolled;
    });
  }
}
