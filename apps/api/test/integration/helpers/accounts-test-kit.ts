/**
 * Integration test kit for US6 (T097). Adds personal-account services on top of the shared-elements
 * kit, sharing one Prisma connection / tenant. Requires a live RLS-enabled PostgreSQL.
 */
import { OutboxWriter } from '../../../src/modules/events/outbox/outbox.writer';
import { AuditWriter } from '../../../src/modules/permissions/audit/audit.writer';
import { AccountRepository } from '../../../src/modules/accounts/infrastructure/account.repository';
import { AccountsService } from '../../../src/modules/accounts/application/accounts.service';
import { SharedElementsTestKit } from './shared-elements-test-kit';

export class AccountsTestKit extends SharedElementsTestKit {
  readonly accountRepo = new AccountRepository();
  readonly accountsSvc = new AccountsService(
    this.tenancy,
    this.accountRepo,
    this.profileRepo,
    this.repo,
    this.periodService,
    new OutboxWriter(),
    new AuditWriter(),
  );
}
