/**
 * Integration test kit for US5 (T087/T088/T089). Extends the contributions kit with shared-element
 * services, sharing one Prisma connection / tenant. Requires a live RLS-enabled PostgreSQL.
 */
import { OutboxWriter } from '../../../src/modules/events/outbox/outbox.writer';
import { AuditWriter } from '../../../src/modules/permissions/audit/audit.writer';
import { SharedElementsRepository } from '../../../src/modules/shared-elements/infrastructure/shared-elements.repository';
import { SharedElementsService } from '../../../src/modules/shared-elements/application/shared-elements.service';
import { SharedElementsReadService } from '../../../src/modules/shared-elements/interface/shared-elements.read';
import { DebtReassignmentConsumer } from '../../../src/modules/shared-elements/application/debt-reassignment.consumer';
import { ContributionsTestKit } from './contributions-test-kit';

export class SharedElementsTestKit extends ContributionsTestKit {
  readonly seRepo = new SharedElementsRepository();
  readonly elements = new SharedElementsService(this.tenancy, this.seRepo, new OutboxWriter(), new AuditWriter());
  readonly seRead = new SharedElementsReadService(this.tenancy, this.seRepo);
  readonly reassign = new DebtReassignmentConsumer({ register() {} } as never, this.tenancy, this.seRepo);

  /** Responsibility shares for a debt as a membershipId → bp map. */
  async responsibilities(sharedDebtId: string): Promise<Map<string, number>> {
    return this.tenancy.withTenant(this.tenantId, async (tx) => {
      const rows = await this.seRepo.listResponsibilities(tx, sharedDebtId);
      return new Map(rows.map((r) => [r.membershipId, r.percentageBp]));
    });
  }
}
