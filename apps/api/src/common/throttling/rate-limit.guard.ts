/**
 * GraphQL rate-limit guard (T109 — CHK027).
 *
 * Applies per-principal fixed-window limits at the GraphQL boundary, before any resolver runs:
 *  - every top-level **mutation** counts against the `mutation` bucket;
 *  - the `coachingInsights` query counts against the tighter `coaching` bucket, which is what
 *    bounds OpenRouter spend (one LLM call per coaching query — Principle III surface).
 *
 * Limits are env-tunable (RATE_LIMIT_MUTATIONS_PER_MINUTE / RATE_LIMIT_COACHING_PER_MINUTE) and a
 * rejection carries the stable `RATE_LIMITED` code with `retryAfterSeconds` (see errors/catalog.ts).
 */
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GqlContextType, GqlExecutionContext } from '@nestjs/graphql';
import { GraphQLError, GraphQLResolveInfo } from 'graphql';
import type { GraphQLContext } from '../graphql/graphql-context';
import { TransportErrorCode } from '../errors/catalog';
import { RateLimiterService, RateLimitRule } from './rate-limiter.service';

const COACHING_FIELD = 'coachingInsights';

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly mutationRule: RateLimitRule;
  private readonly coachingRule: RateLimitRule;

  constructor(
    private readonly limiter: RateLimiterService,
    config: ConfigService,
  ) {
    this.mutationRule = {
      bucket: 'mutation',
      limit: intFromEnv(config, 'RATE_LIMIT_MUTATIONS_PER_MINUTE', 120),
      windowSeconds: 60,
    };
    this.coachingRule = {
      bucket: 'coaching',
      limit: intFromEnv(config, 'RATE_LIMIT_COACHING_PER_MINUTE', 10),
      windowSeconds: 60,
    };
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType<GqlContextType>() !== 'graphql') return true;

    const gql = GqlExecutionContext.create(context);
    const info = gql.getInfo<GraphQLResolveInfo>();
    const rule = this.ruleFor(info);
    if (!rule) return true;

    const ctx = gql.getContext<GraphQLContext>();
    const principalKey = ctx.principal ? `${ctx.principal.tenantId}:${ctx.principal.userId}` : 'anonymous';

    const decision = await this.limiter.check(rule, principalKey);
    if (!decision.allowed) {
      throw new GraphQLError('Rate limit exceeded — retry later', {
        extensions: {
          code: TransportErrorCode.RATE_LIMITED,
          details: { retryAfterSeconds: decision.retryAfterSeconds, bucket: rule.bucket },
        },
      });
    }
    return true;
  }

  private ruleFor(info: GraphQLResolveInfo | undefined): RateLimitRule | null {
    if (!info) return null;
    if (info.parentType.name === 'Mutation') return this.mutationRule;
    if (info.parentType.name === 'Query' && info.fieldName === COACHING_FIELD) return this.coachingRule;
    return null;
  }
}

function intFromEnv(config: ConfigService, key: string, fallback: number): number {
  const raw = config.get<string>(key);
  const parsed = raw ? Number(raw) : NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
