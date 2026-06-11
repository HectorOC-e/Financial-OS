/**
 * Coaching read service (T101/T105 support — FR-022/Principle III). Builds the permission-scoped,
 * read-only coaching projection from the shared analytics core. Strictly read-only: it opens no
 * writes, emits no events, and is scoped to a profile the caller is an ACTIVE member of (existence is
 * not leaked to non-members).
 */
import { Injectable } from '@nestjs/common';
import { DomainError, Result, ok, err } from '../../../common/errors';
import { TenancyService, TenantTx } from '../../tenancy/tenancy.service';
import type { TenantPrincipal } from '../../tenancy/tenant-context';
import { ContributionRepository } from '../../contributions/infrastructure/contribution.repository';
import { PeriodService } from '../../contributions/application/period.service';
import { AnalyticsService } from '../../contributions/domain/analytics/analytics.service';
import { CoachingMember, CoachingReadModel } from '../domain/coaching-projection';

@Injectable()
export class CoachingReadService {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly contributions: ContributionRepository,
    private readonly periods: PeriodService,
    private readonly analytics: AnalyticsService,
  ) {}

  async readModel(principal: TenantPrincipal, sharedProfileId: string): Promise<Result<CoachingReadModel>> {
    return this.tenancy.withTenant(principal.tenantId, async (tx) => {
      const membership = await tx.membership.findUnique({
        where: { sharedProfileId_userId: { sharedProfileId, userId: principal.userId } },
      });
      if (!membership || membership.status !== 'ACTIVE') {
        return err(DomainError.forbidden('Coaching is scoped to profiles you are a member of', { sharedProfileId }));
      }
      const profile = await tx.sharedProfile.findUnique({ where: { id: sharedProfileId } });
      if (!profile) return err(DomainError.notFound('Shared profile not found'));

      const period = await this.contributions.openPeriod(tx, sharedProfileId);
      // Prefer the period snapshot; with no open period yet, compute live from the current plan + incomes.
      const snapshot = period ? await this.periods.snapshotMembers(tx, period) : await this.liveSnapshot(tx, sharedProfileId);

      const members: CoachingMember[] = [];
      let poolExpectedCents = 0n;
      let poolActualCents = 0n;
      for (const m of snapshot) {
        const expectedCents = this.analytics.expectedFor(m.incomeCents, m.percentageBp);
        const actualCents = period ? await this.contributions.actualForMember(tx, period.id, m.membershipId) : 0n;
        const state = this.analytics.standing(expectedCents, actualCents).state;
        members.push({ membershipId: m.membershipId, expectedCents, actualCents, state });
        poolExpectedCents += expectedCents;
        poolActualCents += actualCents;
      }

      return ok({ sharedProfileId, baseCurrency: profile.baseCurrency, poolExpectedCents, poolActualCents, members });
    });
  }

  /** Live per-member snapshot (no open period yet): current plan allocations × declared incomes. */
  private async liveSnapshot(
    tx: TenantTx,
    sharedProfileId: string,
  ): Promise<{ membershipId: string; incomeCents: bigint; percentageBp: number }[]> {
    const members = await this.contributions.activeMemberships(tx, sharedProfileId);
    const plan = await this.contributions.currentPlan(tx, sharedProfileId);
    const allocations = plan ? await this.contributions.listAllocations(tx, plan.id) : [];
    const bp = new Map(allocations.map((alloc) => [alloc.membershipId, alloc.percentageBp]));
    return members.map((m) => ({ membershipId: m.id, incomeCents: m.declaredIncomeCents, percentageBp: bp.get(m.id) ?? 0 }));
  }
}
