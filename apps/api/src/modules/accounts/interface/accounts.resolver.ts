/**
 * Personal-account GraphQL resolvers (T095 — US6/FR-004/FR-010).
 *
 * `PersonalProfile.accounts` is resolved ONLY for the owning caller (the read model attaches a
 * PersonalProfile only to the caller's own user, and the service re-checks ownership), so other
 * members can never see someone's personal accounts. Personal accounts are excluded from shared-pool
 * calculations; contributing moves only the contributed amount into the pool.
 */
import { Args, Context, Mutation, Parent, ResolveField, Resolver } from '@nestjs/graphql';
import type { Account } from '@prisma/client';
import { GraphQLError } from 'graphql';
import { Result, isErr, toGraphQLError } from '../../../common/errors';
import type { GraphQLContext } from '../../../common/graphql/graphql-context';
import type { TenantPrincipal } from '../../tenancy/tenant-context';
import { MoneyType } from '../../../common/graphql/money.type';
import { AccountType, PersonalProfileType } from '../../profiles/interface/dto/profile.types';
import { AccountsService } from '../application/accounts.service';
import { CreatePersonalAccountInput, ContributeFromAccountInput } from './dto/account.inputs';

function mapAccount(row: Account): AccountType {
  const dto = new AccountType();
  dto.id = row.id;
  dto.profileType = row.profileType;
  dto.type = row.type;
  dto.name = row.name;
  dto.balance = MoneyType.fromCents(row.balance, row.currency);
  dto.currency = row.currency;
  return dto;
}

@Resolver(() => PersonalProfileType)
export class AccountsResolver {
  constructor(private readonly accountsService: AccountsService) {}

  @ResolveField('accounts', () => [AccountType])
  async accounts(@Context() ctx: GraphQLContext, @Parent() personal: PersonalProfileType): Promise<AccountType[]> {
    const rows = await this.accountsService.accountsForOwnedProfile(principalOf(ctx), personal.id);
    return rows.map(mapAccount);
  }

  @Mutation(() => AccountType)
  async createPersonalAccount(@Context() ctx: GraphQLContext, @Args('input') input: CreatePersonalAccountInput): Promise<AccountType> {
    const account = unwrap(await this.accountsService.createPersonalAccount(principalOf(ctx), input));
    return mapAccount(account);
  }

  @Mutation(() => AccountType)
  async contributeFromAccount(@Context() ctx: GraphQLContext, @Args('input') input: ContributeFromAccountInput): Promise<AccountType> {
    const result = unwrap(await this.accountsService.contributeFromAccount(principalOf(ctx), input));
    return mapAccount(result.account);
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
