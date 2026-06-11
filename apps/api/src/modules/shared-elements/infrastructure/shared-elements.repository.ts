/**
 * Shared-elements repository (T082) — goals, debts, debt responsibilities, investments, and
 * period-scoped budgets. Tenant-scoped (RLS via the ambient GUC); every mutable record carries a
 * `version` column, so updates go through the optimistic-concurrency helper (FR-006a). Each method
 * runs inside a caller-supplied tenant transaction.
 */
import { Injectable } from '@nestjs/common';
import type { SharedBudget, SharedDebt, SharedDebtKind, SharedGoal, SharedInvestment } from '@prisma/client';
import type { TenantTx } from '../../tenancy/tenancy.service';
import { prismaVersionedUpdate } from '../../../common/persistence/versioned-repository';

@Injectable()
export class SharedElementsRepository {
  // --- goals --------------------------------------------------------------------------------------

  createGoal(tx: TenantTx, tenantId: string, sharedProfileId: string, name: string, targetAmount: bigint): Promise<SharedGoal> {
    return tx.sharedGoal.create({ data: { tenantId, sharedProfileId, name, targetAmount } });
  }
  findGoal(tx: TenantTx, id: string): Promise<SharedGoal | null> {
    return tx.sharedGoal.findUnique({ where: { id } });
  }
  fundGoalVersioned(tx: TenantTx, id: string, fundedAmount: bigint, status: SharedGoal['status']): (v: number) => Promise<number> {
    return prismaVersionedUpdate(tx.sharedGoal, { id }, { fundedAmount, status });
  }

  // --- debts / credit cards -----------------------------------------------------------------------

  createDebt(
    tx: TenantTx,
    tenantId: string,
    sharedProfileId: string,
    kind: SharedDebtKind,
    name: string,
    outstandingBalance: bigint,
  ): Promise<SharedDebt> {
    return tx.sharedDebt.create({ data: { tenantId, sharedProfileId, kind, name, outstandingBalance } });
  }
  findDebt(tx: TenantTx, id: string): Promise<SharedDebt | null> {
    return tx.sharedDebt.findUnique({ where: { id } });
  }
  debtsForProfile(tx: TenantTx, sharedProfileId: string): Promise<SharedDebt[]> {
    return tx.sharedDebt.findMany({ where: { sharedProfileId } });
  }
  payDebtVersioned(tx: TenantTx, id: string, outstandingBalance: bigint): (v: number) => Promise<number> {
    return prismaVersionedUpdate(tx.sharedDebt, { id }, { outstandingBalance });
  }
  /** Bump only the debt's version (used when responsibilities change but the balance does not). */
  touchDebtVersioned(tx: TenantTx, id: string): (v: number) => Promise<number> {
    return prismaVersionedUpdate(tx.sharedDebt, { id }, {});
  }

  // --- debt responsibilities ----------------------------------------------------------------------

  listResponsibilities(tx: TenantTx, sharedDebtId: string) {
    return tx.debtResponsibility.findMany({ where: { sharedDebtId } });
  }
  /** Replace the full responsibility set for a debt atomically (always re-validated to sum 100%). */
  async replaceResponsibilities(
    tx: TenantTx,
    tenantId: string,
    sharedDebtId: string,
    shares: { membershipId: string; percentageBp: number }[],
  ): Promise<void> {
    await tx.debtResponsibility.deleteMany({ where: { sharedDebtId } });
    for (const s of shares) {
      await tx.debtResponsibility.create({
        data: { tenantId, sharedDebtId, membershipId: s.membershipId, percentageBp: s.percentageBp },
      });
    }
  }

  // --- investments --------------------------------------------------------------------------------

  createInvestment(tx: TenantTx, tenantId: string, sharedProfileId: string, name: string, currentValue: bigint): Promise<SharedInvestment> {
    return tx.sharedInvestment.create({ data: { tenantId, sharedProfileId, name, currentValue } });
  }
  findInvestment(tx: TenantTx, id: string): Promise<SharedInvestment | null> {
    return tx.sharedInvestment.findUnique({ where: { id } });
  }
  updateInvestmentVersioned(tx: TenantTx, id: string, currentValue: bigint, valueAsOf: Date): (v: number) => Promise<number> {
    return prismaVersionedUpdate(tx.sharedInvestment, { id }, { currentValue, valueAsOf });
  }

  // --- budgets (period-scoped) --------------------------------------------------------------------

  createBudget(
    tx: TenantTx,
    tenantId: string,
    sharedProfileId: string,
    periodId: string,
    category: string,
    limit: bigint,
  ): Promise<SharedBudget> {
    return tx.sharedBudget.create({ data: { tenantId, sharedProfileId, periodId, category, limit } });
  }
  findBudget(tx: TenantTx, id: string): Promise<SharedBudget | null> {
    return tx.sharedBudget.findUnique({ where: { id } });
  }
  recordSpendVersioned(tx: TenantTx, id: string, spent: bigint): (v: number) => Promise<number> {
    return prismaVersionedUpdate(tx.sharedBudget, { id }, { spent });
  }
}
