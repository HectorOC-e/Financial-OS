import DataLoader from 'dataloader';
import { TenantPrincipal } from '../../modules/tenancy/tenant-context';
import type { RequestMembership } from '../../modules/permissions/permissions.guard';

/** Minimal structural view of the incoming HTTP request (avoids a hard dependency on express types). */
interface HttpRequestLike {
  headers: Record<string, string | string[] | undefined>;
}

/**
 * Per-request GraphQL context (T029): the authenticated principal (tenant + user), the resolved
 * membership for the targeted profile (populated by resolvers before guarded operations), and a
 * per-request DataLoader registry (R8) so batching/caching never crosses request or tenant lines.
 */
export interface GraphQLContext {
  principal?: TenantPrincipal;
  membership?: RequestMembership;
  loaders: Map<string, DataLoader<unknown, unknown>>;
}

/**
 * Builds the context from the incoming request. Identity is external (assumption in data-model.md);
 * until the auth integration lands, the principal is derived from trusted gateway headers. Replace
 * `principalFromRequest` with real token verification when auth is wired.
 */
export function buildGraphQLContext({ req }: { req: HttpRequestLike }): GraphQLContext {
  return {
    principal: principalFromRequest(req),
    loaders: new Map(),
  };
}

function principalFromRequest(req: HttpRequestLike): TenantPrincipal | undefined {
  const tenantId = headerValue(req, 'x-tenant-id');
  const userId = headerValue(req, 'x-user-id');
  const authSubject = headerValue(req, 'x-auth-subject');
  if (!tenantId || !userId || !authSubject) {
    return undefined;
  }
  return { tenantId, userId, authSubject };
}

function headerValue(req: HttpRequestLike, name: string): string | undefined {
  const value = req.headers[name];
  if (Array.isArray(value)) return value[0];
  return value;
}
