/**
 * Contribution repository (T051) — plans, allocations, periods, and (append-only) records. Every
 * method runs inside a caller-supplied tenant transaction (RLS via the ambient GUC). Allocations and
 * shared records carry a `version` column; allocation writes here are plain upserts (setAllocation
 * carries no expectedVersion in the contract — the cross-profile cap is the authoritative guard).
 */
import { Injectable } from '@nestjs/common';
import type {
  ContributionAllocation,
  ContributionPeriod,
  ContributionPlan,
  ContributionRecord,
  Membership,
  Prisma,
} from '@prisma/client';
import type { TenantTx } from '../../tenancy/tenancy.service';

@Injectable()
export class ContributionRepository {
  // --- plans & allocations ------------------------------------------------------------------------

  /** The latest (highest-version) plan for a profile, or null if none exists yet. */
  currentPlan(tx: TenantTx, sharedProfileId: string): Promise<ContributionPlan | null> {
    return tx.contributionPlan.findFirst({ where: { sharedProfileId }, orderBy: { version: 'desc' } });
  }

  createPlan(
    tx: TenantTx,
    tenantId: string,
    sharedProfileId: string,
    version: number,
    createdBy: string,
    effectiveFromPeriodId: string | null,
  ): Promise<ContributionPlan> {
    return tx.contributionPlan.create({
      data: { tenantId, sharedProfileId, version, createdBy, effectiveFromPeriodId },
    });
  }

  planByVersion(tx: TenantTx, sharedProfileId: string, version: number): Promise<ContributionPlan | null> {
    return tx.contributionPlan.findUnique({ where: { sharedProfileId_version: { sharedProfileId, version } } });
  }

  listAllocations(tx: TenantTx, contributionPlanId: string): Promise<ContributionAllocation[]> {
    return tx.contributionAllocation.findMany({ where: { contributionPlanId } });
  }

  async upsertAllocation(
    tx: TenantTx,
    tenantId: string,
    contributionPlanId: string,
    membershipId: string,
    percentageBp: number,
  ): Promise<ContributionAllocation> {
    return tx.contributionAllocation.upsert({
      where: { contributionPlanId_membershipId: { contributionPlanId, membershipId } },
      create: { tenantId, contributionPlanId, membershipId, percentageBp },
      update: { percentageBp, version: { increment: 1 } },
    });
  }

  /**
   * A member's current committed percentage in each profile they belong to — the input to the
   * cross-profile cap (FR-015a). For each ACTIVE membership of the user, reads the allocation in that
   * profile's latest plan (absent ⇒ 0%).
   */
  async committedByUser(tx: TenantTx, userId: string): Promise<{ sharedProfileId: string; percentageBp: number }[]> {
    const memberships = await tx.membership.findMany({ where: { userId, status: 'ACTIVE' } });
    const out: { sharedProfileId: string; percentageBp: number }[] = [];
    for (const m of memberships) {
      const plan = await this.currentPlan(tx, m.sharedProfileId);
      if (!plan) continue;
      const alloc = await tx.contributionAllocation.findUnique({
        where: { contributionPlanId_membershipId: { contributionPlanId: plan.id, membershipId: m.id } },
      });
      out.push({ sharedProfileId: m.sharedProfileId, percentageBp: alloc?.percentageBp ?? 0 });
    }
    return out;
  }

  allocationFor(tx: TenantTx, planId: string, membershipId: string): Promise<ContributionAllocation | null> {
    return tx.contributionAllocation.findUnique({
      where: { contributionPlanId_membershipId: { contributionPlanId: planId, membershipId } },
    });
  }

  // --- periods ------------------------------------------------------------------------------------

  openPeriod(tx: TenantTx, sharedProfileId: string): Promise<ContributionPeriod | null> {
    return tx.contributionPeriod.findFirst({ where: { sharedProfileId, status: 'OPEN' }, orderBy: { startDate: 'desc' } });
  }

  createPeriod(
    tx: TenantTx,
    tenantId: string,
    sharedProfileId: string,
    startDate: Date,
    endDate: Date,
    planVersionSnapshot: number,
    incomeSnapshot: Prisma.InputJsonValue,
  ): Promise<ContributionPeriod> {
    return tx.contributionPeriod.create({
      data: { tenantId, sharedProfileId, startDate, endDate, planVersionSnapshot, incomeSnapshot, status: 'OPEN' },
    });
  }

  async closePeriod(tx: TenantTx, periodId: string): Promise<void> {
    await tx.contributionPeriod.update({ where: { id: periodId }, data: { status: 'CLOSED' } });
  }

  duePeriods(tx: TenantTx, now: Date): Promise<ContributionPeriod[]> {
    return tx.contributionPeriod.findMany({ where: { status: 'OPEN', endDate: { lte: now } }, take: 500 });
  }

  // --- records (append-only) ----------------------------------------------------------------------

  createRecord(
    tx: TenantTx,
    tenantId: string,
    data: { sharedProfileId: string; periodId: string; membershipId: string; amount: bigint; sourceAccountId?: string | null },
  ): Promise<ContributionRecord> {
    return tx.contributionRecord.create({
      data: {
        tenantId,
        sharedProfileId: data.sharedProfileId,
        periodId: data.periodId,
        membershipId: data.membershipId,
        amount: data.amount,
        sourceAccountId: data.sourceAccountId ?? null,
      },
    });
  }

  /** Σ actual recorded amounts per membership for a period. */
  async actualByMember(tx: TenantTx, periodId: string): Promise<Map<string, bigint>> {
    const rows = await tx.contributionRecord.groupBy({
      by: ['membershipId'],
      where: { periodId },
      _sum: { amount: true },
    });
    return new Map(rows.map((r) => [r.membershipId, r._sum.amount ?? 0n]));
  }

  async actualForMember(tx: TenantTx, periodId: string, membershipId: string): Promise<bigint> {
    const agg = await tx.contributionRecord.aggregate({ where: { periodId, membershipId }, _sum: { amount: true } });
    return agg._sum.amount ?? 0n;
  }

  activeMemberships(tx: TenantTx, sharedProfileId: string): Promise<Membership[]> {
    return tx.membership.findMany({ where: { sharedProfileId, status: 'ACTIVE' } });
  }
}
