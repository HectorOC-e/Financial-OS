import { Global, Module } from '@nestjs/common';
import { PermissionsGuard } from './permissions.guard';
import { AuditWriter } from './audit/audit.writer';
import { AuditConsumer } from './audit/audit.consumer';

/**
 * RBAC enforcement (capability matrix + guard) and the immutable audit trail (FR-006/FR-007).
 * Exported globally so every feature module can apply PermissionsGuard and write audit entries.
 */
@Global()
@Module({
  providers: [PermissionsGuard, AuditWriter, AuditConsumer],
  exports: [PermissionsGuard, AuditWriter],
})
export class PermissionsModule {}
