import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GqlExecutionContext } from '@nestjs/graphql';
import { MemberRole } from '@prisma/client';
import { DomainError } from '../../common/errors';
import { Capability, can } from './capability-matrix';
import { REQUIRE_CAPABILITY_KEY } from './require-capability.decorator';

/**
 * Resolved membership context attached to the GraphQL request by a resolver/interceptor before the
 * guarded operation (the caller's role within the target profile).
 */
export interface RequestMembership {
  membershipId: string;
  sharedProfileId: string;
  role: MemberRole;
}

export interface GraphQLContextWithMembership {
  membership?: RequestMembership;
}

/**
 * Enforces the capability matrix (FR-006). On insufficient permission it throws a FORBIDDEN domain
 * error and the operation never reaches the resolver — guaranteeing "rejected with no state change".
 * Resolvers without a @RequireCapability annotation are unguarded by this guard.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Capability | undefined>(
      REQUIRE_CAPABILITY_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required) {
      return true;
    }

    const gqlCtx = GqlExecutionContext.create(context).getContext<GraphQLContextWithMembership>();
    const membership = gqlCtx.membership;
    if (!membership) {
      throw DomainError.forbidden('No active membership for this profile', { capability: required });
    }
    if (!can(membership.role, required)) {
      throw DomainError.forbidden('Your role does not permit this action', {
        capability: required,
        role: membership.role,
      });
    }
    return true;
  }
}
