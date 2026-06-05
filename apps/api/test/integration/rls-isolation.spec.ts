/**
 * RLS tenant-isolation integration test (T018 / SC-? Principle IX).
 *
 * Proves tenant B cannot read tenant A's rows even with a raw query, because PostgreSQL RLS
 * (migration 20260605000002_rls) scopes every statement to the `app.tenant_id` GUC.
 *
 * Requires a live PostgreSQL with migrations applied and DATABASE_URL set; the app role must be a
 * non-superuser. Run via `pnpm --filter @financial-os/api test:integration`.
 */
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../src/common/persistence/prisma.service';
import { TenancyService } from '../../src/modules/tenancy/tenancy.service';

describe('PostgreSQL RLS tenant isolation (T018)', () => {
  const prisma = new PrismaService();
  const tenancy = new TenancyService(prisma);

  const tenantA = randomUUID();
  const tenantB = randomUUID();

  beforeAll(async () => {
    await prisma.$connect();
    // Seed one user per tenant, each within its own tenant scope.
    await tenancy.withTenant(tenantA, async (tx) => {
      await tx.tenant.create({ data: { id: tenantA, name: 'Tenant A' } });
      await tx.user.create({
        data: { tenantId: tenantA, authSubject: 'a-sub', displayName: 'Alice' },
      });
    });
    await tenancy.withTenant(tenantB, async (tx) => {
      await tx.tenant.create({ data: { id: tenantB, name: 'Tenant B' } });
      await tx.user.create({
        data: { tenantId: tenantB, authSubject: 'b-sub', displayName: 'Bob' },
      });
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('tenant B cannot read tenant A users', async () => {
    const visibleToB = await tenancy.withTenant(tenantB, (tx) => tx.user.findMany());
    expect(visibleToB.every((u) => u.tenantId === tenantB)).toBe(true);
    expect(visibleToB.find((u) => u.authSubject === 'a-sub')).toBeUndefined();
  });

  it('tenant A sees only its own users', async () => {
    const visibleToA = await tenancy.withTenant(tenantA, (tx) => tx.user.findMany());
    expect(visibleToA.every((u) => u.tenantId === tenantA)).toBe(true);
    expect(visibleToA.find((u) => u.authSubject === 'a-sub')).toBeDefined();
  });

  it('a query with no tenant scope returns no rows (default-deny)', async () => {
    // No GUC set on this fresh transaction → RLS hides everything.
    const rows = await prisma.$transaction((tx) => tx.user.findMany());
    expect(rows).toHaveLength(0);
  });
});
