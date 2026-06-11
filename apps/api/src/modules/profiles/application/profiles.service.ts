/**
 * Profile governance use cases (T035/T037/T040 — US1).
 *
 * Orchestration only (Principle IV): each use case opens ONE tenant-scoped transaction, loads state,
 * delegates the decision to the pure domain functions, persists the returned delta, and — in the same
 * transaction — appends the domain event (outbox, R4) and the audit entry (FR-007). State change,
 * event, and audit therefore commit atomically. Capability enforcement (FR-006) happens here, before
 * any write, so a rejected command produces no state change.
 */
import { Injectable } from '@nestjs/common';
import type { Membership, MemberRole, SharedProfile } from '@prisma/client';
import { DomainError, Result, ok, err, isErr } from '../../../common/errors';
import { updateWithOptimisticLock } from '../../../common/persistence/versioned-repository';
import { TenancyService, TenantTx } from '../../tenancy/tenancy.service';
import { OutboxWriter } from '../../events/outbox/outbox.writer';
import { EventType } from '../../events/event-envelope';
import { AuditWriter } from '../../permissions/audit/audit.writer';
import { Capability, can } from '../../permissions/capability-matrix';
import type { TenantPrincipal } from '../../tenancy/tenant-context';
import { ProfileRepository, toSharedProfileState } from '../infrastructure/profile.repository';
import { MembershipRepository, toMembershipState } from '../infrastructure/membership.repository';
import * as MembershipDomain from '../domain/entities/membership';
import * as ProfileDomain from '../domain/entities/shared-profile';

export interface CreateSharedProfileInput {
  name: string;
  baseCurrency: string;
  periodLength: 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY';
}

export interface InviteMemberInput {
  sharedProfileId: string;
  userId: string;
  role: MemberRole;
}

@Injectable()
export class ProfilesService {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly profiles: ProfileRepository,
    private readonly memberships: MembershipRepository,
    private readonly outbox: OutboxWriter,
    private readonly audit: AuditWriter,
  ) {}

  // --- creation -----------------------------------------------------------------------------------

  async createSharedProfile(
    principal: TenantPrincipal,
    input: CreateSharedProfileInput,
  ): Promise<Result<SharedProfile>> {
    return this.tenancy.withTenant(principal.tenantId, async (tx) => {
      const now = new Date();
      const profile = await this.profiles.createSharedProfile(tx, principal.tenantId, {
        name: input.name,
        baseCurrency: input.baseCurrency,
        periodLength: input.periodLength,
      });
      // The creator is the founding OWNER (ACTIVE immediately — no invitation step).
      const owner = await this.memberships.create(tx, principal.tenantId, {
        sharedProfileId: profile.id,
        userId: principal.userId,
        role: 'OWNER',
        status: 'ACTIVE',
        invitedAt: now,
        invitationExpiresAt: MembershipDomain.invitationExpiresAt(now),
        joinedAt: now,
      });
      await this.profiles.setOwnerMembershipId(tx, profile.id, owner.id);

      await this.outbox.write(tx, principal.tenantId, {
        eventType: EventType.SharedProfileCreated,
        aggregateType: 'SharedProfile',
        aggregateId: profile.id,
        actorMembershipId: owner.id,
        payload: { name: profile.name, baseCurrency: profile.baseCurrency },
      });
      await this.audit.write(tx, principal.tenantId, {
        sharedProfileId: profile.id,
        actorMembershipId: owner.id,
        action: 'SharedProfileCreated',
        afterValue: { name: profile.name, ownerMembershipId: owner.id },
      });
      return ok({ ...profile, ownerMembershipId: owner.id });
    });
  }

  // --- invitations --------------------------------------------------------------------------------

  async inviteMember(principal: TenantPrincipal, input: InviteMemberInput): Promise<Result<Membership>> {
    return this.tenancy.withTenant(principal.tenantId, async (tx) => {
      const actorCheck = await this.requireCapability(tx, input.sharedProfileId, principal.userId, Capability.INVITE_MEMBER);
      if (isErr(actorCheck)) return actorCheck;
      const actor = actorCheck.value;

      const profile = await this.profiles.findSharedProfile(tx, input.sharedProfileId);
      if (!profile) return err(DomainError.notFound('Shared profile not found'));
      const writable = ProfileDomain.assertWritable(toSharedProfileState(profile));
      if (isErr(writable)) return writable;

      if (input.role === 'OWNER') {
        return err(DomainError.invariant('Cannot invite a member directly as OWNER (FR-007b)'));
      }
      const existing = await this.memberships.findByProfileAndUser(tx, input.sharedProfileId, input.userId);
      if (existing && !MembershipDomain.isTerminal(existing.status)) {
        return err(DomainError.invariant('User already has an active or pending membership', { status: existing.status }));
      }

      const now = new Date();
      const member = await this.memberships.create(tx, principal.tenantId, {
        sharedProfileId: input.sharedProfileId,
        userId: input.userId,
        role: input.role,
        status: 'INVITED',
        invitedAt: now,
        invitationExpiresAt: MembershipDomain.invitationExpiresAt(now),
      });

      await this.emit(tx, principal.tenantId, EventType.MemberInvited, 'Membership', member.id, actor.id, {
        sharedProfileId: input.sharedProfileId,
        invitedUserId: input.userId,
        role: input.role,
        invitationExpiresAt: member.invitationExpiresAt.toISOString(),
      });
      await this.audit.write(tx, principal.tenantId, {
        sharedProfileId: input.sharedProfileId,
        actorMembershipId: actor.id,
        action: 'MemberInvited',
        afterValue: { membershipId: member.id, userId: input.userId, role: input.role },
      });
      return ok(member);
    });
  }

  acceptInvitation(principal: TenantPrincipal, membershipId: string): Promise<Result<Membership>> {
    return this.transitionOwnMembership(principal, membershipId, EventType.InvitationAccepted, 'InvitationAccepted', (m, now) =>
      MembershipDomain.accept(m, now),
    );
  }

  declineInvitation(principal: TenantPrincipal, membershipId: string): Promise<Result<Membership>> {
    return this.transitionOwnMembership(principal, membershipId, EventType.InvitationDeclined, 'InvitationDeclined', (m) =>
      MembershipDomain.decline(m),
    );
  }

  leaveProfile(principal: TenantPrincipal, membershipId: string): Promise<Result<Membership>> {
    return this.transitionOwnMembership(principal, membershipId, EventType.MemberLeft, 'MemberLeft', (m, now) =>
      MembershipDomain.leave(m, now),
    );
  }

  // --- role & ownership ---------------------------------------------------------------------------

  async changeMemberRole(
    principal: TenantPrincipal,
    membershipId: string,
    role: MemberRole,
    expectedVersion: number,
  ): Promise<Result<Membership>> {
    return this.tenancy.withTenant(principal.tenantId, async (tx) => {
      const target = await this.memberships.findById(tx, membershipId);
      if (!target) return err(DomainError.notFound('Membership not found'));

      const actorCheck = await this.requireCapability(tx, target.sharedProfileId, principal.userId, Capability.CHANGE_MEMBER_ROLE);
      if (isErr(actorCheck)) return actorCheck;
      const actor = actorCheck.value;

      const profile = await this.profiles.findSharedProfile(tx, target.sharedProfileId);
      if (!profile) return err(DomainError.notFound('Shared profile not found'));
      const writable = ProfileDomain.assertWritable(toSharedProfileState(profile));
      if (isErr(writable)) return writable;

      const decision = MembershipDomain.changeRole(toMembershipState(target), role);
      if (isErr(decision)) return decision;

      const locked = await updateWithOptimisticLock<Membership>({
        expectedVersion,
        conditionalUpdate: this.memberships.changeRoleVersioned(tx, membershipId, role),
        reload: async () => (await this.memberships.findById(tx, membershipId))!,
      });
      if (isErr(locked)) return locked;
      const updated = locked.value!;

      await this.emit(tx, principal.tenantId, EventType.MemberRoleChanged, 'Membership', membershipId, actor.id, {
        sharedProfileId: target.sharedProfileId,
        fromRole: target.role,
        toRole: role,
      });
      await this.audit.write(tx, principal.tenantId, {
        sharedProfileId: target.sharedProfileId,
        actorMembershipId: actor.id,
        action: 'MemberRoleChanged',
        beforeValue: { role: target.role },
        afterValue: { role },
      });
      return ok(updated);
    });
  }

  async nominateOwner(
    principal: TenantPrincipal,
    sharedProfileId: string,
    nomineeMembershipId: string,
  ): Promise<Result<Membership>> {
    return this.tenancy.withTenant(principal.tenantId, async (tx) => {
      const actorCheck = await this.requireCapability(tx, sharedProfileId, principal.userId, Capability.NOMINATE_OWNER);
      if (isErr(actorCheck)) return actorCheck;
      const actor = actorCheck.value;

      const nominee = await this.memberships.findById(tx, nomineeMembershipId);
      if (!nominee || nominee.sharedProfileId !== sharedProfileId) {
        return err(DomainError.notFound('Nominee membership not found in this profile'));
      }
      const decision = MembershipDomain.nominateOwner(toMembershipState(nominee));
      if (isErr(decision)) return decision;
      await this.memberships.applyDelta(tx, nominee.id, decision.value);

      await this.emit(tx, principal.tenantId, EventType.OwnerNominated, 'Membership', nominee.id, actor.id, {
        sharedProfileId,
        nomineeMembershipId: nominee.id,
      });
      await this.audit.write(tx, principal.tenantId, {
        sharedProfileId,
        actorMembershipId: actor.id,
        action: 'OwnerNominated',
        afterValue: { nomineeMembershipId: nominee.id },
      });
      return ok((await this.memberships.findById(tx, nominee.id))!);
    });
  }

  async acceptOwnership(principal: TenantPrincipal, sharedProfileId: string): Promise<Result<SharedProfile>> {
    return this.tenancy.withTenant(principal.tenantId, async (tx) => {
      const nominee = await this.memberships.findByProfileAndUser(tx, sharedProfileId, principal.userId);
      if (!nominee) return err(DomainError.notFound('You are not a member of this profile'));

      const members = await this.memberships.listByProfile(tx, sharedProfileId);
      const currentOwner = members.find((m) => m.role === 'OWNER' && m.status === 'ACTIVE');
      if (!currentOwner) return err(DomainError.invariant('Profile has no active owner'));

      const decision = MembershipDomain.acceptOwnership(toMembershipState(nominee), toMembershipState(currentOwner));
      if (isErr(decision)) return decision;

      await this.memberships.applyDelta(tx, nominee.id, decision.value.nominee);
      await this.memberships.applyDelta(tx, currentOwner.id, decision.value.outgoingOwner);
      await this.profiles.setOwnerMembershipId(tx, sharedProfileId, nominee.id);

      await this.emit(tx, principal.tenantId, EventType.OwnershipTransferred, 'SharedProfile', sharedProfileId, nominee.id, {
        fromMembershipId: currentOwner.id,
        toMembershipId: nominee.id,
      });
      await this.audit.write(tx, principal.tenantId, {
        sharedProfileId,
        actorMembershipId: nominee.id,
        action: 'OwnershipTransferred',
        beforeValue: { ownerMembershipId: currentOwner.id },
        afterValue: { ownerMembershipId: nominee.id },
      });
      return ok((await this.profiles.findSharedProfile(tx, sharedProfileId))!);
    });
  }

  async archiveProfile(principal: TenantPrincipal, sharedProfileId: string): Promise<Result<SharedProfile>> {
    return this.tenancy.withTenant(principal.tenantId, async (tx) => {
      const actorCheck = await this.requireCapability(tx, sharedProfileId, principal.userId, Capability.ARCHIVE_PROFILE);
      if (isErr(actorCheck)) return actorCheck;
      const actor = actorCheck.value;

      const profile = await this.profiles.findSharedProfile(tx, sharedProfileId);
      if (!profile) return err(DomainError.notFound('Shared profile not found'));
      const members = await this.memberships.listByProfile(tx, sharedProfileId);

      const decision = ProfileDomain.archive(
        toSharedProfileState(profile),
        toMembershipState(actor),
        members.map(toMembershipState),
        new Date(),
      );
      if (isErr(decision)) return decision;
      await this.profiles.archive(tx, sharedProfileId, decision.value.archivedAt);

      await this.emit(tx, principal.tenantId, EventType.ProfileArchived, 'SharedProfile', sharedProfileId, actor.id, {
        archivedAt: decision.value.archivedAt.toISOString(),
      });
      await this.audit.write(tx, principal.tenantId, {
        sharedProfileId,
        actorMembershipId: actor.id,
        action: 'ProfileArchived',
        beforeValue: { status: profile.status },
        afterValue: { status: 'ARCHIVED' },
      });
      return ok((await this.profiles.findSharedProfile(tx, sharedProfileId))!);
    });
  }

  // --- shared helpers -----------------------------------------------------------------------------

  /**
   * Transition the *caller's own* membership (accept/decline/leave) — these need no capability check
   * (a member acts on their own membership) but must verify ownership of the membership row.
   */
  private async transitionOwnMembership(
    principal: TenantPrincipal,
    membershipId: string,
    eventType: string,
    auditAction: string,
    decide: (m: MembershipDomain.MembershipState, now: Date) => Result<MembershipDomain.MembershipDelta>,
  ): Promise<Result<Membership>> {
    return this.tenancy.withTenant(principal.tenantId, async (tx) => {
      const membership = await this.memberships.findById(tx, membershipId);
      if (!membership || membership.userId !== principal.userId) {
        return err(DomainError.notFound('Membership not found'));
      }
      const decision = decide(toMembershipState(membership), new Date());
      if (isErr(decision)) return decision;
      await this.memberships.applyDelta(tx, membershipId, decision.value);

      await this.emit(tx, principal.tenantId, eventType, 'Membership', membershipId, membership.id, {
        sharedProfileId: membership.sharedProfileId,
        status: decision.value.status,
      });
      await this.audit.write(tx, principal.tenantId, {
        sharedProfileId: membership.sharedProfileId,
        actorMembershipId: membership.id,
        action: auditAction,
        beforeValue: { status: membership.status },
        afterValue: { status: decision.value.status },
      });
      return ok((await this.memberships.findById(tx, membershipId))!);
    });
  }

  /** Resolve the caller's ACTIVE membership in a profile and enforce a capability (FR-005/FR-006). */
  private async requireCapability(
    tx: TenantTx,
    sharedProfileId: string,
    userId: string,
    capability: Capability,
  ): Promise<Result<Membership>> {
    const membership = await this.memberships.findByProfileAndUser(tx, sharedProfileId, userId);
    if (!membership || membership.status !== 'ACTIVE') {
      return err(DomainError.forbidden('No active membership for this profile', { capability }));
    }
    if (!can(membership.role, capability)) {
      return err(DomainError.forbidden('Your role does not permit this action', { capability, role: membership.role }));
    }
    return ok(membership);
  }

  private async emit(
    tx: TenantTx,
    tenantId: string,
    eventType: string,
    aggregateType: string,
    aggregateId: string,
    actorMembershipId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await this.outbox.write(tx, tenantId, { eventType, aggregateType, aggregateId, actorMembershipId, payload });
  }
}
