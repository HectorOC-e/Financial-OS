/**
 * Profile-governance GraphQL resolvers (T038/T039 — US1).
 *
 * Thin interface layer (Principle IV/VII): extract the authenticated principal, delegate to the
 * application use cases, and shape the result. Business rules, capability enforcement (FR-006),
 * archived-write rejection (FR-007c), and optimistic concurrency (FR-006a) all live behind these
 * calls in ProfilesService. Domain errors are surfaced with a stable `extensions.code`.
 */
import { Args, Context, ID, Int, Mutation, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import { MemberRole } from '@prisma/client';
import { GraphQLError } from 'graphql';
import { Result, isErr, toGraphQLError } from '../../../common/errors';
import { PageArgs, pageSlice } from '../../../common/graphql/pagination';
import type { GraphQLContext } from '../../../common/graphql/graphql-context';
import type { TenantPrincipal } from '../../tenancy/tenant-context';
import { ProfilesService } from '../application/profiles.service';
import { ProfilesReadService } from './profiles.read';
import { MembershipType, SharedProfileType, UserType } from './dto/profile.types';
import { CreateSharedProfileInput, InviteMemberInput, NominateOwnerInput } from './dto/profile.inputs';

@Resolver(() => SharedProfileType)
export class ProfilesResolver {
  constructor(
    private readonly profiles: ProfilesService,
    private readonly read: ProfilesReadService,
  ) {}

  // --- queries ------------------------------------------------------------------------------------

  @Query(() => UserType)
  me(@Context() ctx: GraphQLContext): Promise<UserType> {
    return this.read.me(principalOf(ctx));
  }

  @Query(() => SharedProfileType, { nullable: true })
  sharedProfile(
    @Context() ctx: GraphQLContext,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<SharedProfileType | null> {
    return this.read.sharedProfile(principalOf(ctx), id);
  }

  @Query(() => [MembershipType])
  myMemberships(@Context() ctx: GraphQLContext): Promise<MembershipType[]> {
    return this.read.myMemberships(principalOf(ctx));
  }

  // --- field resolvers ------------------------------------------------------------------------------

  /** Cursor-paginated members list (T107/CHK017); bounded even when no args are supplied. */
  @ResolveField('members', () => [MembershipType])
  members(@Parent() profile: SharedProfileType, @Args() page: PageArgs): MembershipType[] {
    return pageSlice(profile.members ?? [], page);
  }

  // --- mutations ----------------------------------------------------------------------------------

  @Mutation(() => SharedProfileType)
  async createSharedProfile(
    @Context() ctx: GraphQLContext,
    @Args('input') input: CreateSharedProfileInput,
  ): Promise<SharedProfileType> {
    const principal = principalOf(ctx);
    const created = unwrap(await this.profiles.createSharedProfile(principal, input));
    return (await this.read.sharedProfile(principal, created.id))!;
  }

  @Mutation(() => MembershipType)
  async inviteMember(
    @Context() ctx: GraphQLContext,
    @Args('input') input: InviteMemberInput,
  ): Promise<MembershipType> {
    const principal = principalOf(ctx);
    const member = unwrap(await this.profiles.inviteMember(principal, input));
    return this.read.membershipById(principal, member.id);
  }

  @Mutation(() => MembershipType)
  async acceptInvitation(
    @Context() ctx: GraphQLContext,
    @Args('membershipId', { type: () => ID }) membershipId: string,
  ): Promise<MembershipType> {
    const principal = principalOf(ctx);
    const m = unwrap(await this.profiles.acceptInvitation(principal, membershipId));
    return this.read.membershipById(principal, m.id);
  }

  @Mutation(() => MembershipType)
  async declineInvitation(
    @Context() ctx: GraphQLContext,
    @Args('membershipId', { type: () => ID }) membershipId: string,
  ): Promise<MembershipType> {
    const principal = principalOf(ctx);
    const m = unwrap(await this.profiles.declineInvitation(principal, membershipId));
    return this.read.membershipById(principal, m.id);
  }

  @Mutation(() => MembershipType)
  async changeMemberRole(
    @Context() ctx: GraphQLContext,
    @Args('membershipId', { type: () => ID }) membershipId: string,
    @Args('role', { type: () => MemberRole }) role: MemberRole,
    @Args('expectedVersion', { type: () => Int }) expectedVersion: number,
  ): Promise<MembershipType> {
    const principal = principalOf(ctx);
    const m = unwrap(await this.profiles.changeMemberRole(principal, membershipId, role, expectedVersion));
    return this.read.membershipById(principal, m.id);
  }

  @Mutation(() => MembershipType)
  async leaveProfile(
    @Context() ctx: GraphQLContext,
    @Args('membershipId', { type: () => ID }) membershipId: string,
  ): Promise<MembershipType> {
    const principal = principalOf(ctx);
    const m = unwrap(await this.profiles.leaveProfile(principal, membershipId));
    return this.read.membershipById(principal, m.id);
  }

  @Mutation(() => MembershipType)
  async nominateOwner(
    @Context() ctx: GraphQLContext,
    @Args('input') input: NominateOwnerInput,
  ): Promise<MembershipType> {
    const principal = principalOf(ctx);
    const m = unwrap(await this.profiles.nominateOwner(principal, input.sharedProfileId, input.nomineeMembershipId));
    return this.read.membershipById(principal, m.id);
  }

  @Mutation(() => SharedProfileType)
  async acceptOwnership(
    @Context() ctx: GraphQLContext,
    @Args('sharedProfileId', { type: () => ID }) sharedProfileId: string,
  ): Promise<SharedProfileType> {
    const principal = principalOf(ctx);
    unwrap(await this.profiles.acceptOwnership(principal, sharedProfileId));
    return (await this.read.sharedProfile(principal, sharedProfileId))!;
  }

  @Mutation(() => SharedProfileType)
  async archiveProfile(
    @Context() ctx: GraphQLContext,
    @Args('sharedProfileId', { type: () => ID }) sharedProfileId: string,
  ): Promise<SharedProfileType> {
    const principal = principalOf(ctx);
    unwrap(await this.profiles.archiveProfile(principal, sharedProfileId));
    return (await this.read.sharedProfile(principal, sharedProfileId))!;
  }
}

/** Pull the authenticated principal from context, or reject (no anonymous access). */
function principalOf(ctx: GraphQLContext): TenantPrincipal {
  if (!ctx.principal) {
    throw new GraphQLError('Not authenticated', { extensions: { code: 'UNAUTHENTICATED' } });
  }
  return ctx.principal;
}

/** Unwrap a domain Result, throwing a GraphQL error with a stable `extensions.code` on failure. */
function unwrap<T>(result: Result<T>): T {
  if (isErr(result)) {
    throw toGraphQLError(result.error);
  }
  return result.value;
}
