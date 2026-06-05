import { Injectable, OnModuleInit } from '@nestjs/common';
import { TenancyService } from '../../tenancy/tenancy.service';
import { EventHandler, EventRegistry } from '../../events/registry/event-registry';
import { DomainEventEnvelope, EventType } from '../../events/event-envelope';
import { AuditWriter } from './audit.writer';

/** Event types that must produce an immutable audit entry (FR-007 + financially significant). */
const AUDITED_EVENTS: string[] = [
  EventType.SharedProfileCreated,
  EventType.MemberInvited,
  EventType.InvitationAccepted,
  EventType.InvitationDeclined,
  EventType.InvitationExpired,
  EventType.MemberRoleChanged,
  EventType.MemberLeft,
  EventType.OwnerNominated,
  EventType.OwnershipTransferred,
  EventType.ProfileArchived,
  EventType.DeclaredIncomeSet,
  EventType.AllocationSet,
  EventType.PercentageRedistributed,
  EventType.ContributionRecorded,
  EventType.GoalFunded,
  EventType.SharedDebtPaid,
  EventType.DebtResponsibilitySet,
];

/**
 * Persists an AuditEntry for every membership/permission change and financially significant event
 * (FR-007). Registered as a domain-event consumer; idempotency is guaranteed by the worker's
 * eventId guard (T023). Runs within the originating tenant's RLS scope.
 */
@Injectable()
export class AuditConsumer implements EventHandler, OnModuleInit {
  readonly name = 'audit';
  readonly eventTypes = AUDITED_EVENTS;

  constructor(
    private readonly registry: EventRegistry,
    private readonly tenancy: TenancyService,
    private readonly auditWriter: AuditWriter,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async handle(envelope: DomainEventEnvelope): Promise<void> {
    const sharedProfileId =
      envelope.aggregateType === 'SharedProfile' ? envelope.aggregateId : pickProfileId(envelope.payload);

    await this.tenancy.withTenant(envelope.tenantId, (tx) =>
      this.auditWriter.write(tx, envelope.tenantId, {
        sharedProfileId,
        actorMembershipId: envelope.actorMembershipId,
        action: envelope.eventType,
        afterValue: envelope.payload,
      }),
    );
  }
}

function pickProfileId(payload: Record<string, unknown>): string | null {
  const candidate = payload.sharedProfileId;
  return typeof candidate === 'string' ? candidate : null;
}
