/**
 * MemberLeft → debt-responsibility reassignment consumer (T084 — FR-020a).
 *
 * When a member leaves, their responsibility share on every shared debt/credit card in the profile is
 * reassigned proportionally to the remaining members (largest-remainder, sums to 100%). Registered as
 * a domain-event consumer; idempotent — re-delivery is a no-op once the leaver is no longer present in
 * a debt's responsibility set. Runs within the originating tenant's RLS scope.
 */
import { Injectable, OnModuleInit } from '@nestjs/common';
import { TenancyService } from '../../tenancy/tenancy.service';
import { EventHandler, EventRegistry } from '../../events/registry/event-registry';
import { DomainEventEnvelope, EventType } from '../../events/event-envelope';
import { SharedElementsRepository } from '../infrastructure/shared-elements.repository';
import { reassignOnLeave } from '../domain/debt-responsibility';

@Injectable()
export class DebtReassignmentConsumer implements EventHandler, OnModuleInit {
  readonly name = 'debt-reassignment';
  readonly eventTypes = [EventType.MemberLeft];

  constructor(
    private readonly registry: EventRegistry,
    private readonly tenancy: TenancyService,
    private readonly repo: SharedElementsRepository,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async handle(envelope: DomainEventEnvelope): Promise<void> {
    const sharedProfileId = typeof envelope.payload.sharedProfileId === 'string' ? envelope.payload.sharedProfileId : null;
    if (!sharedProfileId) return;
    const leavingMembershipId = envelope.aggregateId; // MemberLeft aggregate is the Membership
    await this.reassignForLeftMember(envelope.tenantId, sharedProfileId, leavingMembershipId);
  }

  /** Reassign the departing member's shares across all of the profile's debts (idempotent). */
  async reassignForLeftMember(tenantId: string, sharedProfileId: string, leavingMembershipId: string): Promise<number> {
    return this.tenancy.withTenant(tenantId, async (tx) => {
      const debts = await this.repo.debtsForProfile(tx, sharedProfileId);
      let changed = 0;
      for (const debt of debts) {
        const shares = await this.repo.listResponsibilities(tx, debt.id);
        if (!shares.some((s) => s.membershipId === leavingMembershipId)) continue; // already reassigned
        const reassigned = reassignOnLeave(
          shares.map((s) => ({ membershipId: s.membershipId, percentageBp: s.percentageBp })),
          leavingMembershipId,
        );
        await this.repo.replaceResponsibilities(tx, tenantId, debt.id, reassigned);
        changed += 1;
      }
      return changed;
    });
  }
}
