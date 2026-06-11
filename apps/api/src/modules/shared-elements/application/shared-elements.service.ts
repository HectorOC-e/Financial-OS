/**
 * Shared-elements use cases (T083/T085/T092 — US5). Orchestration only (Principle IV): one tenant
 * transaction per command, server-authoritative money validation (exact funding, overpayment
 * rejection, period-scoped budgets), optimistic concurrency on every mutable record (FR-006a), and —
 * atomically — domain events (outbox) plus audit entries for financially significant mutations.
 * Writes are rejected on archived profiles (FR-007c).
 */
import { Injectable } from '@nestjs/common';
import type { SharedBudget, SharedDebt, SharedGoal, SharedInvestment } from '@prisma/client';
import { DomainError, Result, ok, err, isErr } from '../../../common/errors';
import { updateWithOptimisticLock } from '../../../common/persistence/versioned-repository';
import { allocateByLargestRemainder } from '../../../common/money/percentage';
import { TenancyService, TenantTx } from '../../tenancy/tenancy.service';
import { OutboxWriter } from '../../events/outbox/outbox.writer';
import { EventType } from '../../events/event-envelope';
import { AuditWriter } from '../../permissions/audit/audit.writer';
import { Capability, can } from '../../permissions/capability-matrix';
import type { TenantPrincipal } from '../../tenancy/tenant-context';
import { SharedElementsRepository } from '../infrastructure/shared-elements.repository';
import { fundGoal } from '../domain/goal';
import { payDebt } from '../domain/debt';
import { recordSpend, updateInvestmentValue } from '../domain/budget';
import { FULL_BP, ResponsibilityShare, validateSumTo100 } from '../domain/debt-responsibility';

@Injectable()
export class SharedElementsService {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly repo: SharedElementsRepository,
    private readonly outbox: OutboxWriter,
    private readonly audit: AuditWriter,
  ) {}

  // --- goals --------------------------------------------------------------------------------------

  createSharedGoal(principal: TenantPrincipal, sharedProfileId: string, name: string, targetAmountCents: bigint): Promise<Result<SharedGoal>> {
    return this.tenancy.withTenant(principal.tenantId, async (tx) => {
      const actor = await this.guard(tx, sharedProfileId, principal.userId, Capability.MANAGE_SHARED_ELEMENTS);
      if (isErr(actor)) return actor;
      if (targetAmountCents <= 0n) return err(DomainError.validation('Goal target must be positive'));
      const goal = await this.repo.createGoal(tx, principal.tenantId, sharedProfileId, name, targetAmountCents);
      await this.audit.write(tx, principal.tenantId, { sharedProfileId, actorMembershipId: actor.value, action: 'SharedGoalCreated', afterValue: { goalId: goal.id, name } });
      return ok(goal);
    });
  }

  fundGoal(principal: TenantPrincipal, sharedGoalId: string, amountCents: bigint, expectedVersion: number): Promise<Result<SharedGoal>> {
    return this.tenancy.withTenant(principal.tenantId, async (tx) => {
      const goal = await this.repo.findGoal(tx, sharedGoalId);
      if (!goal) return err(DomainError.notFound('Goal not found'));
      const actor = await this.guard(tx, goal.sharedProfileId, principal.userId, Capability.MANAGE_SHARED_ELEMENTS);
      if (isErr(actor)) return actor;

      const decision = fundGoal(goal.fundedAmount, goal.targetAmount, amountCents);
      if (isErr(decision)) return decision;

      const locked = await updateWithOptimisticLock<SharedGoal>({
        expectedVersion,
        conditionalUpdate: this.repo.fundGoalVersioned(tx, sharedGoalId, decision.value.newFundedCents, decision.value.status),
        reload: async () => (await this.repo.findGoal(tx, sharedGoalId))!,
      });
      if (isErr(locked)) return locked;

      await this.outbox.write(tx, principal.tenantId, {
        eventType: EventType.GoalFunded,
        aggregateType: 'SharedGoal',
        aggregateId: sharedGoalId,
        actorMembershipId: actor.value,
        payload: { amountCents: amountCents.toString(), fundedAmount: decision.value.newFundedCents.toString() },
      });
      await this.audit.write(tx, principal.tenantId, { sharedProfileId: goal.sharedProfileId, actorMembershipId: actor.value, action: 'GoalFunded', beforeValue: { fundedAmount: goal.fundedAmount.toString() }, afterValue: { fundedAmount: decision.value.newFundedCents.toString() } });
      return ok(locked.value!);
    });
  }

  // --- debts --------------------------------------------------------------------------------------

  createSharedDebt(principal: TenantPrincipal, sharedProfileId: string, kind: 'DEBT' | 'CREDIT_CARD', name: string, outstandingBalanceCents: bigint): Promise<Result<SharedDebt>> {
    return this.tenancy.withTenant(principal.tenantId, async (tx) => {
      const actor = await this.guard(tx, sharedProfileId, principal.userId, Capability.MANAGE_SHARED_ELEMENTS);
      if (isErr(actor)) return actor;
      if (outstandingBalanceCents < 0n) return err(DomainError.validation('Debt balance cannot be negative'));
      const debt = await this.repo.createDebt(tx, principal.tenantId, sharedProfileId, kind, name, outstandingBalanceCents);

      // Default responsibilities from current contribution percentages (FR-020a).
      const shares = await this.defaultResponsibilitiesFor(tx, sharedProfileId);
      if (shares.length > 0) await this.repo.replaceResponsibilities(tx, principal.tenantId, debt.id, shares);

      await this.audit.write(tx, principal.tenantId, { sharedProfileId, actorMembershipId: actor.value, action: 'SharedDebtCreated', afterValue: { debtId: debt.id, name, kind } });
      return ok(debt);
    });
  }

  paySharedDebt(principal: TenantPrincipal, sharedDebtId: string, amountCents: bigint, expectedVersion: number): Promise<Result<SharedDebt>> {
    return this.tenancy.withTenant(principal.tenantId, async (tx) => {
      const debt = await this.repo.findDebt(tx, sharedDebtId);
      if (!debt) return err(DomainError.notFound('Debt not found'));
      const actor = await this.guard(tx, debt.sharedProfileId, principal.userId, Capability.MANAGE_SHARED_ELEMENTS);
      if (isErr(actor)) return actor;

      const decision = payDebt(debt.outstandingBalance, amountCents);
      if (isErr(decision)) return decision; // OVERPAYMENT or non-positive

      const locked = await updateWithOptimisticLock<SharedDebt>({
        expectedVersion,
        conditionalUpdate: this.repo.payDebtVersioned(tx, sharedDebtId, decision.value.newOutstandingCents),
        reload: async () => (await this.repo.findDebt(tx, sharedDebtId))!,
      });
      if (isErr(locked)) return locked;

      await this.outbox.write(tx, principal.tenantId, {
        eventType: EventType.SharedDebtPaid,
        aggregateType: 'SharedDebt',
        aggregateId: sharedDebtId,
        actorMembershipId: actor.value,
        payload: { amountCents: amountCents.toString(), outstandingBalance: decision.value.newOutstandingCents.toString() },
      });
      await this.audit.write(tx, principal.tenantId, { sharedProfileId: debt.sharedProfileId, actorMembershipId: actor.value, action: 'SharedDebtPaid', beforeValue: { outstandingBalance: debt.outstandingBalance.toString() }, afterValue: { outstandingBalance: decision.value.newOutstandingCents.toString() } });
      return ok(locked.value!);
    });
  }

  /**
   * Set one member's responsibility share; the remaining members are rescaled proportionally so the
   * set still sums to exactly 100% (FR-020a). Guards on the debt's version (FR-006a).
   */
  setDebtResponsibility(principal: TenantPrincipal, sharedDebtId: string, membershipId: string, percentageBp: number, expectedVersion: number): Promise<Result<SharedDebt>> {
    return this.tenancy.withTenant(principal.tenantId, async (tx) => {
      const debt = await this.repo.findDebt(tx, sharedDebtId);
      if (!debt) return err(DomainError.notFound('Debt not found'));
      const actor = await this.guard(tx, debt.sharedProfileId, principal.userId, Capability.SET_DEBT_RESPONSIBILITY);
      if (isErr(actor)) return actor;
      if (!Number.isInteger(percentageBp) || percentageBp < 0 || percentageBp > FULL_BP) {
        return err(DomainError.validation('Responsibility must be 0–10000 basis points', { percentageBp }));
      }

      const current = await this.repo.listResponsibilities(tx, sharedDebtId);
      const others = current.filter((r) => r.membershipId !== membershipId);
      const remaining = FULL_BP - percentageBp;
      if (others.length === 0 && remaining !== 0) {
        return err(DomainError.invariant('A sole responsible member must hold 100%', { percentageBp }));
      }
      const rescaled = allocateByLargestRemainder(
        BigInt(remaining),
        others.map((o) => ({ membershipId: o.membershipId, weightBp: o.percentageBp })),
      ).map((r) => ({ membershipId: r.membershipId, percentageBp: Number(r.amountCents) }));
      const newShares: ResponsibilityShare[] = [{ membershipId, percentageBp }, ...rescaled];

      const sumCheck = validateSumTo100(newShares);
      if (isErr(sumCheck)) return sumCheck;

      const locked = await updateWithOptimisticLock<SharedDebt>({
        expectedVersion,
        conditionalUpdate: this.repo.touchDebtVersioned(tx, sharedDebtId),
        reload: async () => (await this.repo.findDebt(tx, sharedDebtId))!,
      });
      if (isErr(locked)) return locked;
      await this.repo.replaceResponsibilities(tx, principal.tenantId, sharedDebtId, newShares);

      await this.outbox.write(tx, principal.tenantId, {
        eventType: EventType.DebtResponsibilitySet,
        aggregateType: 'SharedDebt',
        aggregateId: sharedDebtId,
        actorMembershipId: actor.value,
        payload: { membershipId, percentageBp },
      });
      await this.audit.write(tx, principal.tenantId, { sharedProfileId: debt.sharedProfileId, actorMembershipId: actor.value, action: 'DebtResponsibilitySet', afterValue: { shares: newShares } });
      return ok(locked.value!);
    });
  }

  // --- investments & budgets ----------------------------------------------------------------------

  createInvestment(principal: TenantPrincipal, sharedProfileId: string, name: string, currentValueCents: bigint): Promise<Result<SharedInvestment>> {
    return this.tenancy.withTenant(principal.tenantId, async (tx) => {
      const actor = await this.guard(tx, sharedProfileId, principal.userId, Capability.MANAGE_SHARED_ELEMENTS);
      if (isErr(actor)) return actor;
      if (currentValueCents < 0n) return err(DomainError.validation('Investment value cannot be negative'));
      const inv = await this.repo.createInvestment(tx, principal.tenantId, sharedProfileId, name, currentValueCents);
      await this.audit.write(tx, principal.tenantId, { sharedProfileId, actorMembershipId: actor.value, action: 'SharedInvestmentCreated', afterValue: { investmentId: inv.id, name } });
      return ok(inv);
    });
  }

  updateInvestmentValue(principal: TenantPrincipal, investmentId: string, newValueCents: bigint, expectedVersion: number): Promise<Result<SharedInvestment>> {
    return this.tenancy.withTenant(principal.tenantId, async (tx) => {
      const inv = await this.repo.findInvestment(tx, investmentId);
      if (!inv) return err(DomainError.notFound('Investment not found'));
      const actor = await this.guard(tx, inv.sharedProfileId, principal.userId, Capability.MANAGE_SHARED_ELEMENTS);
      if (isErr(actor)) return actor;
      const decision = updateInvestmentValue(inv.currentValue, newValueCents);
      if (isErr(decision)) return decision;
      const locked = await updateWithOptimisticLock<SharedInvestment>({
        expectedVersion,
        conditionalUpdate: this.repo.updateInvestmentVersioned(tx, investmentId, decision.value, new Date()),
        reload: async () => (await this.repo.findInvestment(tx, investmentId))!,
      });
      if (isErr(locked)) return locked;
      await this.audit.write(tx, principal.tenantId, { sharedProfileId: inv.sharedProfileId, actorMembershipId: actor.value, action: 'SharedInvestmentValueUpdated', afterValue: { currentValue: decision.value.toString() } });
      return ok(locked.value!);
    });
  }

  createBudget(principal: TenantPrincipal, sharedProfileId: string, category: string, limitCents: bigint): Promise<Result<SharedBudget>> {
    return this.tenancy.withTenant(principal.tenantId, async (tx) => {
      const actor = await this.guard(tx, sharedProfileId, principal.userId, Capability.MANAGE_SHARED_ELEMENTS);
      if (isErr(actor)) return actor;
      if (limitCents < 0n) return err(DomainError.validation('Budget limit cannot be negative'));
      const period = await tx.contributionPeriod.findFirst({ where: { sharedProfileId, status: 'OPEN' }, orderBy: { startDate: 'desc' } });
      if (!period) return err(DomainError.validation('A budget requires an open contribution period'));
      const budget = await this.repo.createBudget(tx, principal.tenantId, sharedProfileId, period.id, category, limitCents);
      await this.audit.write(tx, principal.tenantId, { sharedProfileId, actorMembershipId: actor.value, action: 'SharedBudgetCreated', afterValue: { budgetId: budget.id, category, periodId: period.id } });
      return ok(budget);
    });
  }

  recordBudgetSpend(principal: TenantPrincipal, budgetId: string, amountCents: bigint, expectedVersion: number): Promise<Result<SharedBudget>> {
    return this.tenancy.withTenant(principal.tenantId, async (tx) => {
      const budget = await this.repo.findBudget(tx, budgetId);
      if (!budget) return err(DomainError.notFound('Budget not found'));
      const actor = await this.guard(tx, budget.sharedProfileId, principal.userId, Capability.MANAGE_SHARED_ELEMENTS);
      if (isErr(actor)) return actor;
      const decision = recordSpend(budget.limit, budget.spent, amountCents);
      if (isErr(decision)) return decision;
      const locked = await updateWithOptimisticLock<SharedBudget>({
        expectedVersion,
        conditionalUpdate: this.repo.recordSpendVersioned(tx, budgetId, decision.value.newSpentCents),
        reload: async () => (await this.repo.findBudget(tx, budgetId))!,
      });
      if (isErr(locked)) return locked;
      await this.audit.write(tx, principal.tenantId, { sharedProfileId: budget.sharedProfileId, actorMembershipId: actor.value, action: 'SharedBudgetSpendRecorded', afterValue: { spent: decision.value.newSpentCents.toString() } });
      return ok(locked.value!);
    });
  }

  // --- helpers ------------------------------------------------------------------------------------

  /** Resolve actor, enforce capability + writable profile. Returns the actor membership id on success. */
  private async guard(tx: TenantTx, sharedProfileId: string, userId: string, capability: Capability): Promise<Result<string>> {
    const profile = await tx.sharedProfile.findUnique({ where: { id: sharedProfileId } });
    if (!profile) return err(DomainError.notFound('Shared profile not found'));
    if (profile.status !== 'ACTIVE') return err(DomainError.archived());
    const membership = await tx.membership.findUnique({ where: { sharedProfileId_userId: { sharedProfileId, userId } } });
    if (!membership || membership.status !== 'ACTIVE') {
      return err(DomainError.forbidden('No active membership for this profile', { capability }));
    }
    if (!can(membership.role, capability)) {
      return err(DomainError.forbidden('Your role does not permit this action', { capability, role: membership.role }));
    }
    return ok(membership.id);
  }

  /** Build default debt responsibilities from members' current contribution allocations (FR-020a). */
  private async defaultResponsibilitiesFor(tx: TenantTx, sharedProfileId: string): Promise<ResponsibilityShare[]> {
    const members = await tx.membership.findMany({ where: { sharedProfileId, status: 'ACTIVE' } });
    if (members.length === 0) return [];
    const plan = await tx.contributionPlan.findFirst({ where: { sharedProfileId }, orderBy: { version: 'desc' } });
    const allocations = plan ? await tx.contributionAllocation.findMany({ where: { contributionPlanId: plan.id } }) : [];
    const bpByMember = new Map(allocations.map((a) => [a.membershipId, a.percentageBp]));
    const weights = members.map((m) => ({ membershipId: m.id, weightBp: bpByMember.get(m.id) ?? 0 }));
    const allZero = weights.every((w) => w.weightBp === 0);
    const normalized = allZero ? weights.map((w) => ({ ...w, weightBp: 1 })) : weights;
    return allocateByLargestRemainder(BigInt(FULL_BP), normalized).map((r) => ({ membershipId: r.membershipId, percentageBp: Number(r.amountCents) }));
  }
}
