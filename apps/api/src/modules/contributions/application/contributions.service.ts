/**
 * Contribution use cases (T052/T059 — US2/US3). Orchestration only (Principle IV): authoritative
 * server-side validation (cap, range, overpay-free), one tenant transaction per command, domain
 * decision → persist → outbox event + audit, all atomic. Income/allocation edits are forward-only —
 * they change the member's current value but never a period already snapshotted (FR-016a).
 */
import { Injectable } from '@nestjs/common';
import type { ContributionPlan, ContributionRecord, Membership } from '@prisma/client';
import { DomainError, Result, ok, err, isErr } from '../../../common/errors';
import { TenancyService, TenantTx } from '../../tenancy/tenancy.service';
import { OutboxWriter } from '../../events/outbox/outbox.writer';
import { EventType } from '../../events/event-envelope';
import { AuditWriter } from '../../permissions/audit/audit.writer';
import { Capability, can } from '../../permissions/capability-matrix';
import type { TenantPrincipal } from '../../tenancy/tenant-context';
import { ContributionRepository } from '../infrastructure/contribution.repository';
import { PeriodService } from './period.service';
import { checkAllocationWithinCap, remainingBp } from '../domain/cross-profile-cap';

export interface SetDeclaredIncomeInput {
  sharedProfileId: string;
  membershipId: string;
  amountCents: bigint;
}
export interface SetAllocationInput {
  sharedProfileId: string;
  membershipId: string;
  percentageBp: number;
}
export interface RecordContributionInput {
  sharedProfileId: string;
  membershipId: string;
  amountCents: bigint;
  sourceAccountId?: string | null;
}

@Injectable()
export class ContributionsService {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly repo: ContributionRepository,
    private readonly periods: PeriodService,
    private readonly outbox: OutboxWriter,
    private readonly audit: AuditWriter,
  ) {}

  async setDeclaredIncome(principal: TenantPrincipal, input: SetDeclaredIncomeInput): Promise<Result<Membership>> {
    return this.tenancy.withTenant(principal.tenantId, async (tx) => {
      const ctx = await this.selfMember(tx, input.sharedProfileId, input.membershipId, principal.userId, Capability.SET_OWN_INCOME);
      if (isErr(ctx)) return ctx;
      if (input.amountCents < 0n) return err(DomainError.validation('Declared income cannot be negative'));

      // Forward-only: update the current declared income; snapshotted periods are untouched (FR-016a).
      const updated = await tx.membership.update({
        where: { id: input.membershipId },
        data: { declaredIncomeCents: input.amountCents },
      });
      await this.outbox.write(tx, principal.tenantId, {
        eventType: EventType.DeclaredIncomeSet,
        aggregateType: 'Membership',
        aggregateId: input.membershipId,
        actorMembershipId: input.membershipId,
        payload: { sharedProfileId: input.sharedProfileId, amountCents: input.amountCents.toString() },
      });
      await this.audit.write(tx, principal.tenantId, {
        sharedProfileId: input.sharedProfileId,
        actorMembershipId: input.membershipId,
        action: 'DeclaredIncomeSet',
        beforeValue: { declaredIncomeCents: ctx.value.declaredIncomeCents.toString() },
        afterValue: { declaredIncomeCents: input.amountCents.toString() },
      });
      return ok(updated);
    });
  }

  async setAllocation(principal: TenantPrincipal, input: SetAllocationInput): Promise<Result<ContributionPlan>> {
    return this.tenancy.withTenant(principal.tenantId, async (tx) => {
      const ctx = await this.selfMember(tx, input.sharedProfileId, input.membershipId, principal.userId, Capability.SET_OWN_ALLOCATION);
      if (isErr(ctx)) return ctx;

      // Cross-profile 100% cap + per-profile 0–100% range (FR-013/FR-015a), server-authoritative.
      const committed = await this.repo.committedByUser(tx, principal.userId);
      const capCheck = checkAllocationWithinCap(committed, input.sharedProfileId, input.percentageBp);
      if (isErr(capCheck)) return capCheck;

      let plan = await this.repo.currentPlan(tx, input.sharedProfileId);
      if (!plan) plan = await this.repo.createPlan(tx, principal.tenantId, input.sharedProfileId, 1, input.membershipId, null);
      await this.repo.upsertAllocation(tx, principal.tenantId, plan.id, input.membershipId, input.percentageBp);

      await this.outbox.write(tx, principal.tenantId, {
        eventType: EventType.AllocationSet,
        aggregateType: 'ContributionPlan',
        aggregateId: plan.id,
        actorMembershipId: input.membershipId,
        payload: { sharedProfileId: input.sharedProfileId, membershipId: input.membershipId, percentageBp: input.percentageBp },
      });
      await this.audit.write(tx, principal.tenantId, {
        sharedProfileId: input.sharedProfileId,
        actorMembershipId: input.membershipId,
        action: 'AllocationSet',
        afterValue: { membershipId: input.membershipId, percentageBp: input.percentageBp },
      });
      return ok(plan);
    });
  }

  async recordContribution(principal: TenantPrincipal, input: RecordContributionInput): Promise<Result<ContributionRecord>> {
    return this.tenancy.withTenant(principal.tenantId, async (tx) => {
      const ctx = await this.selfMember(tx, input.sharedProfileId, input.membershipId, principal.userId, Capability.RECORD_CONTRIBUTION);
      if (isErr(ctx)) return ctx;
      if (input.amountCents <= 0n) return err(DomainError.validation('Contribution amount must be positive'));

      const profile = await tx.sharedProfile.findUnique({ where: { id: input.sharedProfileId } });
      if (!profile) return err(DomainError.notFound('Shared profile not found'));
      if (profile.status !== 'ACTIVE') return err(DomainError.archived());

      const period = await this.periods.ensureOpenPeriod(tx, principal.tenantId, profile, new Date());
      const record = await this.repo.createRecord(tx, principal.tenantId, {
        sharedProfileId: input.sharedProfileId,
        periodId: period.id,
        membershipId: input.membershipId,
        amount: input.amountCents,
        sourceAccountId: input.sourceAccountId ?? null,
      });

      await this.outbox.write(tx, principal.tenantId, {
        eventType: EventType.ContributionRecorded,
        aggregateType: 'ContributionRecord',
        aggregateId: record.id,
        actorMembershipId: input.membershipId,
        payload: {
          sharedProfileId: input.sharedProfileId,
          periodId: period.id,
          membershipId: input.membershipId,
          amountCents: input.amountCents.toString(),
        },
      });
      await this.audit.write(tx, principal.tenantId, {
        sharedProfileId: input.sharedProfileId,
        actorMembershipId: input.membershipId,
        action: 'ContributionRecorded',
        afterValue: { periodId: period.id, amountCents: input.amountCents.toString() },
      });
      return ok(record);
    });
  }

  /** A member's available percentage across all their profiles (FR-015a). */
  async remainingAllocationPercentageBp(principal: TenantPrincipal): Promise<number> {
    return this.tenancy.withTenant(principal.tenantId, async (tx) => {
      const committed = await this.repo.committedByUser(tx, principal.userId);
      return remainingBp(committed);
    });
  }

  /**
   * Resolve the caller's own ACTIVE membership in a profile and enforce a capability. Income,
   * allocation, and contribution actions are self-service — the membership must belong to the caller.
   */
  private async selfMember(
    tx: TenantTx,
    sharedProfileId: string,
    membershipId: string,
    userId: string,
    capability: Capability,
  ): Promise<Result<Membership>> {
    const membership = await tx.membership.findUnique({ where: { id: membershipId } });
    if (!membership || membership.sharedProfileId !== sharedProfileId || membership.userId !== userId) {
      return err(DomainError.forbidden('You can only act on your own membership', { capability }));
    }
    if (membership.status !== 'ACTIVE') {
      return err(DomainError.forbidden('Membership is not active', { status: membership.status }));
    }
    if (!can(membership.role, capability)) {
      return err(DomainError.forbidden('Your role does not permit this action', { capability, role: membership.role }));
    }
    return ok(membership);
  }
}
