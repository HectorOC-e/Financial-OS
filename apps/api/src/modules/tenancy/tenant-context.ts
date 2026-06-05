import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Ambient per-request tenant + principal context (R3 / Principle IX). Established by the
 * GraphQL context factory (T029) from the authenticated principal and read by repositories,
 * guards, and the TenancyService without threading it through every signature.
 */
export interface TenantPrincipal {
  tenantId: string;
  userId: string;
  /** External identity subject (from the auth layer). */
  authSubject: string;
}

const storage = new AsyncLocalStorage<TenantPrincipal>();

export const TenantContext = {
  run<T>(principal: TenantPrincipal, fn: () => T): T {
    return storage.run(principal, fn);
  },

  /** Current principal, or undefined outside a request scope. */
  get(): TenantPrincipal | undefined {
    return storage.getStore();
  },

  /** Current tenant id, throwing if no context is active (default-deny posture). */
  requireTenantId(): string {
    const principal = storage.getStore();
    if (!principal) {
      throw new Error('No tenant context: operation attempted outside a tenant-scoped request');
    }
    return principal.tenantId;
  },
};
