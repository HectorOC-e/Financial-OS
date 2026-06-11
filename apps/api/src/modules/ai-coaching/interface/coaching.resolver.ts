/**
 * AI coaching GraphQL resolver (T101 — Principle III/FR-022/FR-023/SC-008).
 *
 * `coachingInsights` is a READ-ONLY query: it builds a permission-scoped projection, asks the
 * read-only OpenRouter client for advisory insights (with deterministic fallback), and returns them.
 * It performs no writes — no outbox, no audit, no domain mutation. Applying a suggestion requires a
 * normal validated mutation by a permitted human.
 */
import { Args, Context, ID, Query, Resolver } from '@nestjs/graphql';
import { GraphQLError } from 'graphql';
import { isErr, toGraphQLError } from '../../../common/errors';
import type { GraphQLContext } from '../../../common/graphql/graphql-context';
import type { TenantPrincipal } from '../../tenancy/tenant-context';
import { CoachingReadService } from '../application/coaching-read.service';
import { OpenRouterClient } from '../infrastructure/openrouter.client';
import { CoachingInsightType } from './dto/coaching.types';

@Resolver()
export class CoachingResolver {
  constructor(
    private readonly read: CoachingReadService,
    private readonly openRouter: OpenRouterClient,
  ) {}

  @Query(() => CoachingInsightType)
  async coachingInsights(
    @Context() ctx: GraphQLContext,
    @Args('sharedProfileId', { type: () => ID }) sharedProfileId: string,
  ): Promise<CoachingInsightType> {
    const principal = principalOf(ctx);
    const model = await this.read.readModel(principal, sharedProfileId);
    if (isErr(model)) throw toGraphQLError(model.error);

    const insight = await this.openRouter.coachingInsight(model.value);
    const dto = new CoachingInsightType();
    dto.summary = insight.summary;
    dto.suggestions = insight.suggestions.map((s) => ({
      title: s.title,
      detail: s.detail,
      suggestedMutation: s.suggestedMutation,
    }));
    return dto;
  }
}

function principalOf(ctx: GraphQLContext): TenantPrincipal {
  if (!ctx.principal) throw new GraphQLError('Not authenticated', { extensions: { code: 'UNAUTHENTICATED' } });
  return ctx.principal;
}
