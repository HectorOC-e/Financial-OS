/**
 * Read model for US5 (T086). Assembles shared-element DTO trees inside a tenant transaction and
 * shapes mutation results. Membership shaping (for debt responsibilities) reuses the profiles mapper.
 */
import { Injectable } from '@nestjs/common';
import type { SharedBudget, SharedDebt, SharedGoal, SharedInvestment } from '@prisma/client';
import { TenancyService, TenantTx } from '../../tenancy/tenancy.service';
import type { TenantPrincipal } from '../../tenancy/tenant-context';
import { MoneyType } from '../../../common/graphql/money.type';
import { PageArgs, prismaPage } from '../../../common/graphql/pagination';
import { mapMembership } from '../../profiles/interface/dto/profile.mapper';
import { SharedElementsRepository } from '../infrastructure/shared-elements.repository';
import { remainingCents } from '../domain/budget';
import {
  DebtResponsibilityType,
  SharedBudgetType,
  SharedDebtType,
  SharedGoalType,
  SharedInvestmentType,
} from './dto/shared-element.types';

@Injectable()
export class SharedElementsReadService {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly repo: SharedElementsRepository,
  ) {}

  // --- field-resolver lists -----------------------------------------------------------------------

  goalsForProfile(principal: TenantPrincipal, profileId: string, currency: string, page: PageArgs): Promise<SharedGoalType[]> {
    return this.tenancy.withTenant(principal.tenantId, async (tx) => {
      // Cursor pagination at the query level (T107): deterministic id order, bounded page size.
      const rows = await tx.sharedGoal.findMany({
        where: { sharedProfileId: profileId },
        orderBy: { id: 'asc' },
        ...prismaPage(page),
      });
      return rows.map((g) => mapGoal(g, currency));
    });
  }

  debtsForProfile(principal: TenantPrincipal, profileId: string, currency: string): Promise<SharedDebtType[]> {
    return this.tenancy.withTenant(principal.tenantId, async (tx) => {
      const rows = await this.repo.debtsForProfile(tx, profileId);
      return Promise.all(rows.map((d) => this.assembleDebt(tx, d, currency)));
    });
  }

  investmentsForProfile(principal: TenantPrincipal, profileId: string, currency: string): Promise<SharedInvestmentType[]> {
    return this.tenancy.withTenant(principal.tenantId, async (tx) => {
      const rows = await tx.sharedInvestment.findMany({ where: { sharedProfileId: profileId } });
      return rows.map((i) => mapInvestment(i, currency));
    });
  }

  budgetsForProfile(principal: TenantPrincipal, profileId: string, currency: string): Promise<SharedBudgetType[]> {
    return this.tenancy.withTenant(principal.tenantId, async (tx) => {
      const rows = await tx.sharedBudget.findMany({ where: { sharedProfileId: profileId } });
      return rows.map((b) => mapBudget(b, currency));
    });
  }

  // --- single-entity result shaping ---------------------------------------------------------------

  goalById(principal: TenantPrincipal, id: string): Promise<SharedGoalType> {
    return this.tenancy.withTenant(principal.tenantId, async (tx) => {
      const g = await this.repo.findGoal(tx, id);
      if (!g) throw new Error('Goal not found');
      return mapGoal(g, await this.currencyOf(tx, g.sharedProfileId));
    });
  }

  debtById(principal: TenantPrincipal, id: string): Promise<SharedDebtType> {
    return this.tenancy.withTenant(principal.tenantId, async (tx) => {
      const d = await this.repo.findDebt(tx, id);
      if (!d) throw new Error('Debt not found');
      return this.assembleDebt(tx, d, await this.currencyOf(tx, d.sharedProfileId));
    });
  }

  investmentById(principal: TenantPrincipal, id: string): Promise<SharedInvestmentType> {
    return this.tenancy.withTenant(principal.tenantId, async (tx) => {
      const i = await this.repo.findInvestment(tx, id);
      if (!i) throw new Error('Investment not found');
      return mapInvestment(i, await this.currencyOf(tx, i.sharedProfileId));
    });
  }

  budgetById(principal: TenantPrincipal, id: string): Promise<SharedBudgetType> {
    return this.tenancy.withTenant(principal.tenantId, async (tx) => {
      const b = await this.repo.findBudget(tx, id);
      if (!b) throw new Error('Budget not found');
      return mapBudget(b, await this.currencyOf(tx, b.sharedProfileId));
    });
  }

  // --- helpers ------------------------------------------------------------------------------------

  private async assembleDebt(tx: TenantTx, debt: SharedDebt, currency: string): Promise<SharedDebtType> {
    const responsibilities = await this.repo.listResponsibilities(tx, debt.id);
    const dto = new SharedDebtType();
    dto.id = debt.id;
    dto.kind = debt.kind;
    dto.name = debt.name;
    dto.outstandingBalance = MoneyType.fromCents(debt.outstandingBalance, currency);
    dto.version = debt.version;
    dto.responsibilities = [];
    for (const r of responsibilities) {
      const member = await tx.membership.findUnique({ where: { id: r.membershipId } });
      const user = member ? await tx.user.findUnique({ where: { id: member.userId } }) : null;
      const res = new DebtResponsibilityType();
      res.id = r.id;
      res.percentageBp = r.percentageBp;
      res.membership = member && user ? mapMembership(member, user, currency) : (undefined as never);
      dto.responsibilities.push(res);
    }
    return dto;
  }

  private async currencyOf(tx: TenantTx, sharedProfileId: string): Promise<string> {
    const profile = await tx.sharedProfile.findUnique({ where: { id: sharedProfileId } });
    return profile?.baseCurrency ?? 'USD';
  }
}

function mapGoal(g: SharedGoal, currency: string): SharedGoalType {
  const dto = new SharedGoalType();
  dto.id = g.id;
  dto.name = g.name;
  dto.targetAmount = MoneyType.fromCents(g.targetAmount, currency);
  dto.fundedAmount = MoneyType.fromCents(g.fundedAmount, currency);
  dto.version = g.version;
  return dto;
}

function mapInvestment(i: SharedInvestment, currency: string): SharedInvestmentType {
  const dto = new SharedInvestmentType();
  dto.id = i.id;
  dto.name = i.name;
  dto.currentValue = MoneyType.fromCents(i.currentValue, currency);
  dto.valueAsOf = i.valueAsOf;
  dto.version = i.version;
  return dto;
}

function mapBudget(b: SharedBudget, currency: string): SharedBudgetType {
  const dto = new SharedBudgetType();
  dto.id = b.id;
  dto.category = b.category;
  dto.limit = MoneyType.fromCents(b.limit, currency);
  dto.spent = MoneyType.fromCents(b.spent, currency);
  dto.remaining = MoneyType.fromCents(remainingCents(b.limit, b.spent), currency);
  dto.periodId = b.periodId;
  dto.version = b.version;
  return dto;
}
