/**
 * Shared-elements GraphQL resolvers (T086 — US5). Mutations delegate to SharedElementsService
 * (server-authoritative money, optimistic concurrency, archived-write rejection); field resolvers
 * extend SharedProfile with its goals/debts/investments/budgets. Viewers are read-only — every
 * mutation requires MANAGE_SHARED_ELEMENTS (or SET_DEBT_RESPONSIBILITY), enforced in the service.
 */
import { Args, Context, ID, Int, Mutation, Parent, ResolveField, Resolver } from '@nestjs/graphql';
import { GraphQLBigInt } from 'graphql-scalars';
import { SharedDebtKind } from '@prisma/client';
import { GraphQLError } from 'graphql';
import { Result, isErr, toGraphQLError } from '../../../common/errors';
import { PageArgs } from '../../../common/graphql/pagination';
import type { GraphQLContext } from '../../../common/graphql/graphql-context';
import type { TenantPrincipal } from '../../tenancy/tenant-context';
import { SharedProfileType } from '../../profiles/interface/dto/profile.types';
import { SharedElementsService } from '../application/shared-elements.service';
import { SharedElementsReadService } from './shared-elements.read';
import {
  SharedBudgetType,
  SharedDebtType,
  SharedGoalType,
  SharedInvestmentType,
} from './dto/shared-element.types';
import { FundGoalInput, PaySharedDebtInput, SetDebtResponsibilityInput } from './dto/shared-element.inputs';

@Resolver(() => SharedProfileType)
export class SharedElementsResolver {
  constructor(
    private readonly elements: SharedElementsService,
    private readonly read: SharedElementsReadService,
  ) {}

  // --- SharedProfile field resolvers (reads; Viewer-visible) --------------------------------------

  /** Cursor-paginated goals list (T107/CHK017); bounded even when no args are supplied. */
  @ResolveField('sharedGoals', () => [SharedGoalType])
  sharedGoals(
    @Context() ctx: GraphQLContext,
    @Parent() p: SharedProfileType,
    @Args() page: PageArgs,
  ): Promise<SharedGoalType[]> {
    return this.read.goalsForProfile(principalOf(ctx), p.id, p.baseCurrency, page);
  }

  @ResolveField('sharedDebts', () => [SharedDebtType])
  sharedDebts(@Context() ctx: GraphQLContext, @Parent() p: SharedProfileType): Promise<SharedDebtType[]> {
    return this.read.debtsForProfile(principalOf(ctx), p.id, p.baseCurrency);
  }

  @ResolveField('sharedInvestments', () => [SharedInvestmentType])
  sharedInvestments(@Context() ctx: GraphQLContext, @Parent() p: SharedProfileType): Promise<SharedInvestmentType[]> {
    return this.read.investmentsForProfile(principalOf(ctx), p.id, p.baseCurrency);
  }

  @ResolveField('sharedBudgets', () => [SharedBudgetType])
  sharedBudgets(@Context() ctx: GraphQLContext, @Parent() p: SharedProfileType): Promise<SharedBudgetType[]> {
    return this.read.budgetsForProfile(principalOf(ctx), p.id, p.baseCurrency);
  }

  // --- goals --------------------------------------------------------------------------------------

  @Mutation(() => SharedGoalType)
  async createSharedGoal(
    @Context() ctx: GraphQLContext,
    @Args('sharedProfileId', { type: () => ID }) sharedProfileId: string,
    @Args('name') name: string,
    @Args('targetAmountCents', { type: () => GraphQLBigInt }) targetAmountCents: bigint,
  ): Promise<SharedGoalType> {
    const principal = principalOf(ctx);
    const goal = unwrap(await this.elements.createSharedGoal(principal, sharedProfileId, name, targetAmountCents));
    return this.read.goalById(principal, goal.id);
  }

  @Mutation(() => SharedGoalType)
  async fundGoal(@Context() ctx: GraphQLContext, @Args('input') input: FundGoalInput): Promise<SharedGoalType> {
    const principal = principalOf(ctx);
    const goal = unwrap(await this.elements.fundGoal(principal, input.sharedGoalId, input.amountCents, input.expectedVersion));
    return this.read.goalById(principal, goal.id);
  }

  // --- debts --------------------------------------------------------------------------------------

  @Mutation(() => SharedDebtType)
  async createSharedDebt(
    @Context() ctx: GraphQLContext,
    @Args('sharedProfileId', { type: () => ID }) sharedProfileId: string,
    @Args('kind', { type: () => SharedDebtKind }) kind: SharedDebtKind,
    @Args('name') name: string,
    @Args('outstandingBalanceCents', { type: () => GraphQLBigInt }) outstandingBalanceCents: bigint,
  ): Promise<SharedDebtType> {
    const principal = principalOf(ctx);
    const debt = unwrap(await this.elements.createSharedDebt(principal, sharedProfileId, kind, name, outstandingBalanceCents));
    return this.read.debtById(principal, debt.id);
  }

  @Mutation(() => SharedDebtType)
  async paySharedDebt(@Context() ctx: GraphQLContext, @Args('input') input: PaySharedDebtInput): Promise<SharedDebtType> {
    const principal = principalOf(ctx);
    const debt = unwrap(await this.elements.paySharedDebt(principal, input.sharedDebtId, input.amountCents, input.expectedVersion));
    return this.read.debtById(principal, debt.id);
  }

  @Mutation(() => SharedDebtType)
  async setDebtResponsibility(@Context() ctx: GraphQLContext, @Args('input') input: SetDebtResponsibilityInput): Promise<SharedDebtType> {
    const principal = principalOf(ctx);
    const debt = unwrap(
      await this.elements.setDebtResponsibility(principal, input.sharedDebtId, input.membershipId, input.percentageBp, input.expectedVersion),
    );
    return this.read.debtById(principal, debt.id);
  }

  // --- investments & budgets ----------------------------------------------------------------------

  @Mutation(() => SharedInvestmentType)
  async createSharedInvestment(
    @Context() ctx: GraphQLContext,
    @Args('sharedProfileId', { type: () => ID }) sharedProfileId: string,
    @Args('name') name: string,
    @Args('currentValueCents', { type: () => GraphQLBigInt }) currentValueCents: bigint,
  ): Promise<SharedInvestmentType> {
    const principal = principalOf(ctx);
    const inv = unwrap(await this.elements.createInvestment(principal, sharedProfileId, name, currentValueCents));
    return this.read.investmentById(principal, inv.id);
  }

  @Mutation(() => SharedInvestmentType)
  async updateInvestmentValue(
    @Context() ctx: GraphQLContext,
    @Args('investmentId', { type: () => ID }) investmentId: string,
    @Args('newValueCents', { type: () => GraphQLBigInt }) newValueCents: bigint,
    @Args('expectedVersion', { type: () => Int }) expectedVersion: number,
  ): Promise<SharedInvestmentType> {
    const principal = principalOf(ctx);
    const inv = unwrap(await this.elements.updateInvestmentValue(principal, investmentId, newValueCents, expectedVersion));
    return this.read.investmentById(principal, inv.id);
  }

  @Mutation(() => SharedBudgetType)
  async createSharedBudget(
    @Context() ctx: GraphQLContext,
    @Args('sharedProfileId', { type: () => ID }) sharedProfileId: string,
    @Args('category') category: string,
    @Args('limitCents', { type: () => GraphQLBigInt }) limitCents: bigint,
  ): Promise<SharedBudgetType> {
    const principal = principalOf(ctx);
    const budget = unwrap(await this.elements.createBudget(principal, sharedProfileId, category, limitCents));
    return this.read.budgetById(principal, budget.id);
  }

  @Mutation(() => SharedBudgetType)
  async recordBudgetSpend(
    @Context() ctx: GraphQLContext,
    @Args('budgetId', { type: () => ID }) budgetId: string,
    @Args('amountCents', { type: () => GraphQLBigInt }) amountCents: bigint,
    @Args('expectedVersion', { type: () => Int }) expectedVersion: number,
  ): Promise<SharedBudgetType> {
    const principal = principalOf(ctx);
    const budget = unwrap(await this.elements.recordBudgetSpend(principal, budgetId, amountCents, expectedVersion));
    return this.read.budgetById(principal, budget.id);
  }
}

function principalOf(ctx: GraphQLContext): TenantPrincipal {
  if (!ctx.principal) throw new GraphQLError('Not authenticated', { extensions: { code: 'UNAUTHENTICATED' } });
  return ctx.principal;
}

function unwrap<T>(result: Result<T>): T {
  if (isErr(result)) throw toGraphQLError(result.error);
  return result.value;
}
