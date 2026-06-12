/**
 * Contribution GraphQL resolvers (T053/T061/T063 — US2/US3).
 *
 * Mutations delegate to ContributionsService (server-authoritative); field resolvers extend
 * SharedProfile (poolTotal, currentPeriod) and Membership (standing, allocationPercentageBp) with
 * derived analytics. A ContributionRecorded invalidates caches (T062) and fans out to the live
 * standing/pool subscriptions (T063) so reads are fresh within ≤5s (SC-007).
 */
import { Args, Context, ID, Int, Mutation, Parent, Query, ResolveField, Resolver, Subscription } from '@nestjs/graphql';
import { GraphQLError } from 'graphql';
import { Result, isErr, toGraphQLError } from '../../../common/errors';
import { PageArgs } from '../../../common/graphql/pagination';
import type { GraphQLContext } from '../../../common/graphql/graphql-context';
import type { TenantPrincipal } from '../../tenancy/tenant-context';
import { MoneyType } from '../../../common/graphql/money.type';
import { SharedProfileType, MembershipType } from '../../profiles/interface/dto/profile.types';
import { ContributionsService } from '../application/contributions.service';
import { ContributionsReadService } from './contributions.read';
import { ContributionEvents } from './contribution-events';
import {
  ContributionPeriodType,
  ContributionPlanType,
  ContributionRecordType,
  ContributionStandingType,
} from './dto/contribution.types';
import { RecordContributionInput, SetAllocationInput, SetDeclaredIncomeInput } from './dto/contribution.inputs';

@Resolver(() => SharedProfileType)
export class ContributionsResolver {
  constructor(
    private readonly contributions: ContributionsService,
    private readonly read: ContributionsReadService,
    private readonly events: ContributionEvents,
  ) {}

  // --- mutations ----------------------------------------------------------------------------------

  @Mutation(() => MembershipType)
  async setDeclaredIncome(
    @Context() ctx: GraphQLContext,
    @Args('input') input: SetDeclaredIncomeInput,
  ): Promise<MembershipType> {
    const principal = principalOf(ctx);
    unwrap(await this.contributions.setDeclaredIncome(principal, input));
    return this.read.membershipById(principal, input.membershipId);
  }

  @Mutation(() => ContributionPlanType)
  async setAllocation(
    @Context() ctx: GraphQLContext,
    @Args('input') input: SetAllocationInput,
  ): Promise<ContributionPlanType> {
    const principal = principalOf(ctx);
    const plan = unwrap(await this.contributions.setAllocation(principal, input));
    const pool = await this.read.poolTotalByProfileId(principal, input.sharedProfileId);
    if (pool) await this.events.onAllocationSet(principal.tenantId, input.sharedProfileId, pool);
    return this.read.planDto(principal, plan.id);
  }

  @Mutation(() => ContributionRecordType)
  async recordContribution(
    @Context() ctx: GraphQLContext,
    @Args('input') input: RecordContributionInput,
  ): Promise<ContributionRecordType> {
    const principal = principalOf(ctx);
    const record = unwrap(await this.contributions.recordContribution(principal, input));
    const pool = await this.read.poolTotalByProfileId(principal, input.sharedProfileId);
    const standing = await this.read.standingByMembershipId(principal, input.membershipId);
    if (pool) await this.events.onContributionRecorded(principal.tenantId, input.sharedProfileId, pool, standing);
    return this.read.recordDto(principal, record.id);
  }

  @Mutation(() => ContributionPlanType)
  async redistribute(
    @Context() ctx: GraphQLContext,
    @Args('sharedProfileId', { type: () => ID }) sharedProfileId: string,
    @Args('allocations', { type: () => [SetAllocationInput] }) allocations: SetAllocationInput[],
  ): Promise<ContributionPlanType> {
    const principal = principalOf(ctx);
    const plan = unwrap(
      await this.contributions.redistribute(
        principal,
        sharedProfileId,
        allocations.map((a) => ({ membershipId: a.membershipId, percentageBp: a.percentageBp })),
      ),
    );
    const pool = await this.read.poolTotalByProfileId(principal, sharedProfileId);
    if (pool) await this.events.onRedistributed(principal.tenantId, sharedProfileId, pool);
    return this.read.planDto(principal, plan.id);
  }

  @Query(() => Int)
  remainingAllocationPercentageBp(@Context() ctx: GraphQLContext): Promise<number> {
    return this.contributions.remainingAllocationPercentageBp(principalOf(ctx));
  }

  // --- SharedProfile field resolvers --------------------------------------------------------------

  @ResolveField('poolTotal', () => MoneyType)
  poolTotal(
    @Context() ctx: GraphQLContext,
    @Parent() profile: SharedProfileType,
    @Args('periodId', { type: () => ID, nullable: true }) periodId?: string | null,
  ): Promise<MoneyType> {
    return this.read.poolTotal(principalOf(ctx), { id: profile.id, baseCurrency: profile.baseCurrency }, periodId);
  }

  /** Cursor-paginated contribution records, newest first (T107/CHK017). */
  @ResolveField('contributionRecords', () => [ContributionRecordType])
  contributionRecords(
    @Context() ctx: GraphQLContext,
    @Parent() profile: SharedProfileType,
    @Args() page: PageArgs,
    @Args('periodId', { type: () => ID, nullable: true }) periodId?: string | null,
  ): Promise<ContributionRecordType[]> {
    return this.read.recordsForProfile(
      principalOf(ctx),
      { id: profile.id, baseCurrency: profile.baseCurrency },
      page,
      periodId,
    );
  }

  @ResolveField('currentPeriod', () => ContributionPeriodType, { nullable: true })
  currentPeriod(
    @Context() ctx: GraphQLContext,
    @Parent() profile: SharedProfileType,
  ): Promise<ContributionPeriodType | null> {
    return this.read.currentPeriod(principalOf(ctx), profile.id);
  }
}

@Resolver(() => MembershipType)
export class MembershipContributionsResolver {
  constructor(private readonly read: ContributionsReadService) {}

  @ResolveField('standing', () => ContributionStandingType, { nullable: true })
  standing(
    @Context() ctx: GraphQLContext,
    @Parent() membership: MembershipType,
    @Args('periodId', { type: () => ID, nullable: true }) periodId?: string | null,
  ): Promise<ContributionStandingType | null> {
    return this.read.standing(principalOf(ctx), membership, periodId);
  }

  @ResolveField('allocationPercentageBp', () => Int, { nullable: true })
  allocationPercentageBp(
    @Context() ctx: GraphQLContext,
    @Parent() membership: MembershipType,
  ): Promise<number | null> {
    return this.read.allocationPercentageBp(principalOf(ctx), membership);
  }
}

/**
 * Live standing/pool subscriptions (T063 / SC-007). Authorization-scoped by `sharedProfileId`; the WS
 * transport is enabled at deployment (the resolvers + schema are in place here).
 */
@Resolver()
export class ContributionSubscriptionsResolver {
  constructor(private readonly events: ContributionEvents) {}

  @Subscription(() => MoneyType, { name: 'poolTotalChanged' })
  poolTotalChanged(@Args('sharedProfileId', { type: () => ID }) sharedProfileId: string): AsyncIterator<unknown> {
    return this.events.poolIterator(sharedProfileId);
  }

  @Subscription(() => ContributionStandingType, { name: 'contributionStandingChanged' })
  contributionStandingChanged(
    @Args('sharedProfileId', { type: () => ID }) sharedProfileId: string,
  ): AsyncIterator<unknown> {
    return this.events.standingIterator(sharedProfileId);
  }
}

function principalOf(ctx: GraphQLContext): TenantPrincipal {
  if (!ctx.principal) {
    throw new GraphQLError('Not authenticated', { extensions: { code: 'UNAUTHENTICATED' } });
  }
  return ctx.principal;
}

function unwrap<T>(result: Result<T>): T {
  if (isErr(result)) throw toGraphQLError(result.error);
  return result.value;
}
