/**
 * SharedProfile domain entity + invariants (T032/T033, FR-005/FR-007c).
 *
 * Pure and framework-free (Principle IV). Encodes the profile-level rules that the application layer
 * enforces around the membership graph: single-owner integrity and sole-owner archival.
 */
import { DomainError, Result, ok, err } from '../../../../common/errors';
import type { MembershipState } from './membership';

export type ProfileStatus = 'ACTIVE' | 'ARCHIVED';

export interface SharedProfileState {
  id: string;
  status: ProfileStatus;
  ownerMembershipId: string | null;
}

export interface ArchiveDelta {
  status: 'ARCHIVED';
  archivedAt: Date;
}

/** A profile is writable only while ACTIVE; ARCHIVED profiles are read-only (FR-007c). */
export function isWritable(p: SharedProfileState): boolean {
  return p.status === 'ACTIVE';
}

/** Guard used by every mutating use case: reject writes against an archived profile (FR-007c). */
export function assertWritable(p: SharedProfileState): Result<void> {
  if (!isWritable(p)) {
    return err(DomainError.archived('This profile is archived and read-only', { sharedProfileId: p.id }));
  }
  return ok(undefined);
}

/** Count of ACTIVE memberships (the members who currently hold access). */
export function activeMemberCount(members: readonly Pick<MembershipState, 'status'>[]): number {
  return members.filter((m) => m.status === 'ACTIVE').length;
}

/**
 * Archive (soft-close) a profile (FR-007c). Permitted only for the OWNER and only when they are the
 * **sole** ACTIVE member — a profile with other active members cannot be unilaterally archived.
 * History is retained immutably; the row is never hard-deleted.
 */
export function archive(
  p: SharedProfileState,
  actor: MembershipState,
  members: readonly MembershipState[],
  now: Date,
): Result<ArchiveDelta> {
  if (p.status === 'ARCHIVED') {
    return err(DomainError.invariant('Profile is already archived', { sharedProfileId: p.id }));
  }
  if (actor.role !== 'OWNER') {
    return err(DomainError.forbidden('Only the owner may archive a profile', { sharedProfileId: p.id }));
  }
  if (activeMemberCount(members) > 1) {
    return err(
      DomainError.invariant('Only a sole owner may archive a profile; remove or transfer other members first', {
        sharedProfileId: p.id,
        activeMembers: activeMemberCount(members),
      }),
    );
  }
  return ok({ status: 'ARCHIVED', archivedAt: now });
}

/** Exactly one OWNER among ACTIVE memberships (FR-005). Used as a post-condition assertion. */
export function assertSingleOwner(members: readonly MembershipState[]): Result<void> {
  const owners = members.filter((m) => m.status === 'ACTIVE' && m.role === 'OWNER');
  if (owners.length !== 1) {
    return err(DomainError.invariant(`Expected exactly one active owner, found ${owners.length}`, { owners: owners.length }));
  }
  return ok(undefined);
}
