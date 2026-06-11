/**
 * Read model for US2/US3 (T053/T061). Assembles plan/standing/pool/period DTOs inside a tenant
 * transaction, sourcing every number from the shared analytics core (Principle X) so GraphQL, exports,
 * and AI coaching agree exactly. Membership shaping reuses the profiles mapper.
 */
import { Injectable } from '@nestjs/common';
import type { ContributionPlan, Membership, User } from '@prisma/client';
import { TenancyService, TenantTx } from '../../tenancy/tenancy.service';
import type { TenantPrincipal } from '../../tenancy/tenant-context';
import { MoneyType } from '../../../common/graphql/money.type';
import { mapMembership } from '../../profiles/interface/dto/profile.mapper';
import { MembershipType } from '../../profiles/interface/dto/profile.types';
import { ContributionRepository } from '../infrastructure/contribution.repository';
import { PeriodService } from '../application/period.service';
import { AnalyticsService } from '../domain/analytics/analytics.service';
import { MemberSnapshot } from '../domain/contribution-period';
import {
  ContributionPeriodType,
  ContributionPlanType,
  ContributionRecordType,
  ContributionStandingType,
  StandingState,
} from './dto/contribution.types';

@Injectable()
export class ContributionsReadService {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly repo: ContributionRepository,
    private readonly periods: PeriodService,
    private readonly analytics: AnalyticsService,
  ) {}

  planDto(principal: TenantPrincipal, planId: string): Promise<ContributionPlanType> {
    return this.tenancy.withTenant(principal.tenantId, async (tx) => {
      const plan = await tx.contributionPlan.findUnique({ where: { id: planId } });
      if (!plan) throw new Error('Plan not found');
      return this.assemblePlan(tx, plan);
    });
  }

  /** A single membership DTO with its profile currency (used to shape mutation results). */
  membershipById(principal: TenantPrincipal, membershipId: string): Promise<MembershipType> {
    return this.tenancy.withTenant(principal.tenantId, async (tx) => {
      const row = await tx.membership.findUnique({ where: { id: membershipId } });
      if (!row) throw new Error('Membership not found');
      const profile = await tx.sharedProfile.findUnique({ where: { id: row.sharedProfileId } });
      return this.membershipDto(tx, membershipId, profile?.baseCurrency ?? 'USD');
    });
  }

  recordDto(principal: TenantPrincipal, recordId: string): Promise<ContributionRecordType> {
    return this.tenancy.withTenant(principal.tenantId, async (tx) => {
      const rec = await tx.contributionRecord.findUnique({ where: { id: recordId } });
      if (!rec) throw new Error('Record not found');
      const profile = await tx.sharedProfile.findUnique({ where: { id: rec.sharedProfileId } });
      const member = await this.membershipDto(tx, rec.membershipId, profile?.baseCurrency ?? 'USD');
      const dto = new ContributionRecordType();
      dto.id = rec.id;
      dto.membership = member;
      dto.amount = MoneyType.fromCents(rec.amount, profile?.baseCurrency ?? 'USD');
      dto.recordedAt = rec.recordedAt;
      return dto;
    });
  }

  /** Pool total looked up by profile id (used by post-mutation event fan-out). Null if profile gone. */
  poolTotalByProfileId(principal: TenantPrincipal, profileId: string): Promise<MoneyType | null> {
    return this.tenancy.withTenant(principal.tenantId, async (tx) => {
      const profile = await tx.sharedProfile.findUnique({ where: { id: profileId } });
      if (!profile) return null;
      const members = await this.snapshotFor(tx, { id: profile.id, baseCurrency: profile.baseCurrency }, null);
      const total = this.analytics.poolExpectedTotal(
        members.map((m) => ({ membershipId: m.membershipId, incomeCents: m.incomeCents, percentageBp: m.percentageBp })),
      );
      return MoneyType.fromCents(total, profile.baseCurrency);
    });
  }

  /** A member's current-period standing, resolved from the membership id. */
  async standingByMembershipId(principal: TenantPrincipal, membershipId: string): Promise<ContributionStandingType | null> {
    const membership = await this.membershipById(principal, membershipId);
    return this.standing(principal, membership, null);
  }

  /** Emergent/expected pool total for a profile (FR-015). Uses the period snapshot when given/open. */
  poolTotal(principal: TenantPrincipal, profile: { id: string; baseCurrency: string }, periodId?: string | null): Promise<MoneyType> {
    return this.tenancy.withTenant(principal.tenantId, async (tx) => {
      const members = await this.snapshotFor(tx, profile, periodId);
      const total = this.analytics.poolExpectedTotal(
        members.map((m) => ({ membershipId: m.membershipId, incomeCents: m.incomeCents, percentageBp: m.percentageBp })),
      );
      return MoneyType.fromCents(total, profile.baseCurrency);
    });
  }

  currentPeriod(principal: TenantPrincipal, profileId: string): Promise<ContributionPeriodType | null> {
    return this.tenancy.withTenant(principal.tenantId, async (tx) => {
      const period = await this.repo.openPeriod(tx, profileId);
      if (!period) return null;
      const dto = new ContributionPeriodType();
      dto.id = period.id;
      dto.startDate = period.startDate;
      dto.endDate = period.endDate;
      dto.status = period.status;
      return dto;
    });
  }

  /** A member's standing for a period (snapshot expected vs Σ actual). Null when no period applies. */
  standing(
    principal: TenantPrincipal,
    membership: MembershipType,
    periodId?: string | null,
  ): Promise<ContributionStandingType | null> {
    return this.tenancy.withTenant(principal.tenantId, async (tx) => {
      const profileId = membership.sharedProfileId;
      if (!profileId) return null;
      const period = periodId
        ? await tx.contributionPeriod.findUnique({ where: { id: periodId } })
        : await this.repo.openPeriod(tx, profileId);
      if (!period) return null;
      const members = await this.periods.snapshotMembers(tx, period);
      const mine = members.find((m) => m.membershipId === membership.id);
      if (!mine) return null;
      const actual = await this.repo.actualForMember(tx, period.id, membership.id);
      const s = this.analytics.standing(this.analytics.expectedFor(mine.incomeCents, mine.percentageBp), actual);
      const currency = membership.currency ?? 'USD';
      const dto = new ContributionStandingType();
      dto.expected = MoneyType.fromCents(s.expectedCents, currency);
      dto.actual = MoneyType.fromCents(s.actualCents, currency);
      dto.variance = MoneyType.fromCents(s.varianceCents, currency);
      dto.state = s.state as StandingState;
      return dto;
    });
  }

  /** The member's current plan allocation (basis points), or null if unset. */
  allocationPercentageBp(principal: TenantPrincipal, membership: MembershipType): Promise<number | null> {
    return this.tenancy.withTenant(principal.tenantId, async (tx) => {
      const profileId = membership.sharedProfileId;
      if (!profileId) return null;
      const plan = await this.repo.currentPlan(tx, profileId);
      if (!plan) return null;
      const alloc = await this.repo.allocationFor(tx, plan.id, membership.id);
      return alloc?.percentageBp ?? null;
    });
  }

  // --- helpers ------------------------------------------------------------------------------------

  private async snapshotFor(tx: TenantTx, profile: { id: string; baseCurrency: string }, periodId?: string | null): Promise<MemberSnapshot[]> {
    const period = periodId
      ? await tx.contributionPeriod.findUnique({ where: { id: periodId } })
      : await this.repo.openPeriod(tx, profile.id);
    if (period) return this.periods.snapshotMembers(tx, period);

    // No period yet: compute live from the current plan + active members' declared income.
    const plan = await this.repo.currentPlan(tx, profile.id);
    const allocations = plan ? await this.repo.listAllocations(tx, plan.id) : [];
    const bp = new Map(allocations.map((a) => [a.membershipId, a.percentageBp]));
    const members = await this.repo.activeMemberships(tx, profile.id);
    return members.map((m) => ({ membershipId: m.id, incomeCents: m.declaredIncomeCents, percentageBp: bp.get(m.id) ?? 0 }));
  }

  private async assemblePlan(tx: TenantTx, plan: ContributionPlan): Promise<ContributionPlanType> {
    const allocations = await this.repo.listAllocations(tx, plan.id);
    const profile = await tx.sharedProfile.findUnique({ where: { id: plan.sharedProfileId } });
    const currency = profile?.baseCurrency ?? 'USD';
    const dto = new ContributionPlanType();
    dto.id = plan.id;
    dto.version = plan.version;
    dto.effectiveFromPeriodId = plan.effectiveFromPeriodId;
    dto.allocations = [];
    for (const a of allocations) {
      const member = await this.membershipDto(tx, a.membershipId, currency);
      dto.allocations.push({ id: a.id, membership: member, percentageBp: a.percentageBp });
    }
    return dto;
  }

  private async membershipDto(tx: TenantTx, membershipId: string, currency: string): Promise<MembershipType> {
    const row = (await tx.membership.findUnique({ where: { id: membershipId } })) as Membership;
    const user = (await tx.user.findUnique({ where: { id: row.userId } })) as User;
    return mapMembership(row, user, currency);
  }
}
