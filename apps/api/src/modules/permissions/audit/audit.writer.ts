import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { TenantTx } from '../../tenancy/tenancy.service';

export interface AuditRecord {
  sharedProfileId?: string | null;
  actorMembershipId?: string | null;
  action: string;
  beforeValue?: unknown;
  afterValue?: unknown;
}

/** Prisma requires `Prisma.JsonNull` (not a literal null) for a JSON column's null value. */
function toJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === null || value === undefined) {
    return Prisma.JsonNull;
  }
  return value as Prisma.InputJsonValue;
}

/**
 * Immutable audit-entry writer (FR-007 / Architectural Constraints). AuditEntry rows are append-only
 * — the domain layer never updates or deletes them. Writes happen inside the caller's transaction so
 * an audit row and its state change commit atomically.
 */
@Injectable()
export class AuditWriter {
  async write(tx: TenantTx, tenantId: string, record: AuditRecord): Promise<void> {
    await tx.auditEntry.create({
      data: {
        tenantId,
        sharedProfileId: record.sharedProfileId ?? null,
        actorMembershipId: record.actorMembershipId ?? null,
        action: record.action,
        beforeValue: toJson(record.beforeValue),
        afterValue: toJson(record.afterValue),
      },
    });
  }
}
