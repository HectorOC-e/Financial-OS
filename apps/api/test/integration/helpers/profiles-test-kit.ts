/**
 * Integration test kit for US1 (T041–T044). Wires the profile use cases against a live database
 * without the Nest DI container (mirrors rls-isolation.spec). Requires PostgreSQL with migrations +
 * RLS applied and the app role as a NON-superuser; DATABASE_URL must be set.
 */
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../src/common/persistence/prisma.service';
import { TenancyService } from '../../../src/modules/tenancy/tenancy.service';
import { OutboxWriter } from '../../../src/modules/events/outbox/outbox.writer';
import { AuditWriter } from '../../../src/modules/permissions/audit/audit.writer';
import { ProfileRepository } from '../../../src/modules/profiles/infrastructure/profile.repository';
import { MembershipRepository } from '../../../src/modules/profiles/infrastructure/membership.repository';
import { ProfilesService } from '../../../src/modules/profiles/application/profiles.service';
import { ProfilesReadService } from '../../../src/modules/profiles/interface/profiles.read';
import type { TenantPrincipal } from '../../../src/modules/tenancy/tenant-context';

export class ProfilesTestKit {
  readonly prisma = new PrismaService();
  readonly tenancy = new TenancyService(this.prisma);
  readonly profileRepo = new ProfileRepository();
  readonly membershipRepo = new MembershipRepository();
  readonly service = new ProfilesService(
    this.tenancy,
    this.profileRepo,
    this.membershipRepo,
    new OutboxWriter(),
    new AuditWriter(),
  );
  readonly read = new ProfilesReadService(this.tenancy, this.profileRepo, this.membershipRepo);

  readonly tenantId = randomUUID();

  async setup(): Promise<void> {
    await this.prisma.$connect();
    await this.tenancy.withTenant(this.tenantId, async (tx) => {
      await tx.tenant.create({ data: { id: this.tenantId, name: `Tenant ${this.tenantId}` } });
    });
  }

  async teardown(): Promise<void> {
    await this.prisma.$disconnect();
  }

  /** Create a user in this tenant and return a principal for it. */
  async createUser(displayName: string): Promise<TenantPrincipal> {
    const authSubject = `sub-${randomUUID()}`;
    const user = await this.tenancy.withTenant(this.tenantId, (tx) =>
      tx.user.create({ data: { tenantId: this.tenantId, authSubject, displayName } }),
    );
    return { tenantId: this.tenantId, userId: user.id, authSubject };
  }

  /** Count outbox + audit rows for a profile (used to assert "no state change"). */
  async stateChangeCounts(sharedProfileId: string): Promise<{ outbox: number; audit: number }> {
    return this.tenancy.withTenant(this.tenantId, async (tx) => {
      const audit = await tx.auditEntry.count({ where: { sharedProfileId } });
      // Outbox has no sharedProfileId column; count by aggregateId across the profile's memberships.
      const memberIds = (await tx.membership.findMany({ where: { sharedProfileId }, select: { id: true } })).map(
        (m) => m.id,
      );
      const outbox = await tx.outboxEvent.count({
        where: { OR: [{ aggregateId: sharedProfileId }, { aggregateId: { in: memberIds } }] },
      });
      return { outbox, audit };
    });
  }

  unwrapOk<T>(r: { ok: true; value: T } | { ok: false; error: unknown }): T {
    if (!r.ok) throw new Error(`Expected ok Result, got error: ${JSON.stringify(r.error)}`);
    return r.value;
  }
}
