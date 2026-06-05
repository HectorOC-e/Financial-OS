import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/persistence/prisma.service';
import { TenantContext } from './tenant-context';

/** Prisma transaction client passed to tenant-scoped work. */
export type TenantTx = Prisma.TransactionClient;

/**
 * Runs a unit of work inside a transaction with the `app.tenant_id` GUC set, so PostgreSQL RLS
 * (T016) scopes every statement to the active tenant. `set_config(..., true)` is transaction-local,
 * so the GUC is automatically cleared at commit/rollback — no leakage across pooled connections.
 *
 * Cross-tenant access is default-denied: if no tenant context is active, this throws before any
 * query runs.
 */
@Injectable()
export class TenancyService {
  constructor(private readonly prisma: PrismaService) {}

  /** Execute `fn` scoped to the ambient request tenant. */
  withCurrentTenant<T>(fn: (tx: TenantTx) => Promise<T>): Promise<T> {
    return this.withTenant(TenantContext.requireTenantId(), fn);
  }

  /** Execute `fn` scoped to an explicit tenant (used by tenant-aware background jobs). */
  withTenant<T>(tenantId: string, fn: (tx: TenantTx) => Promise<T>): Promise<T> {
    if (!tenantId) {
      throw new Error('withTenant requires a tenantId (default-deny)');
    }
    return this.prisma.$transaction(async (tx) => {
      // Parameterized via Prisma.sql to avoid injection; `true` => transaction-local setting.
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      return fn(tx);
    });
  }
}
