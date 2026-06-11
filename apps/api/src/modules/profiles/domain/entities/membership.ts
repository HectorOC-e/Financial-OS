/**
 * Membership domain entity + invariants (T032/T033, FR-002a/FR-005/FR-007a/FR-007b).
 *
 * Pure and framework-free (Principle IV): no NestJS/Prisma/I/O imports. The application layer loads
 * plain state from the repository, calls these deterministic transition functions (passing an
 * explicit `now` — Principle II, no ambient clock), and persists the returned deltas.
 *
 * Status machine (FR-002a):  INVITED → ACTIVE | DECLINED | EXPIRED ;  ACTIVE → LEFT.
 * Terminal states (DECLINED, EXPIRED, LEFT) grant no access and permit no further transitions.
 */
import { DomainError, Result, ok, err } from '../../../../common/errors';

export type MemberRole = 'OWNER' | 'ADMIN' | 'CONTRIBUTOR' | 'VIEWER';
export type MembershipStatus = 'INVITED' | 'ACTIVE' | 'DECLINED' | 'EXPIRED' | 'LEFT';

/** Invitations auto-expire 14 days after they are issued (FR-002a). */
export const INVITATION_TTL_DAYS = 14;
export const INVITATION_TTL_MS = INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000;

/** Minimal membership state the domain reasons about (a projection of the persisted row). */
export interface MembershipState {
  id: string;
  role: MemberRole;
  status: MembershipStatus;
  pendingOwnerNominee: boolean;
  invitationExpiresAt: Date;
  version: number;
}

/** A field-level delta the application layer persists; never includes `version` (the repo bumps it). */
export type MembershipDelta = Partial<
  Pick<MembershipState, 'role' | 'status' | 'pendingOwnerNominee'>
> & { joinedAt?: Date; leftAt?: Date };

const TERMINAL: ReadonlySet<MembershipStatus> = new Set(['DECLINED', 'EXPIRED', 'LEFT']);

export function isTerminal(status: MembershipStatus): boolean {
  return TERMINAL.has(status);
}

/** True once an INVITED membership has passed its expiry instant. */
export function isInvitationExpired(m: MembershipState, now: Date): boolean {
  return m.status === 'INVITED' && now.getTime() >= m.invitationExpiresAt.getTime();
}

/** Compute the expiry instant for an invitation issued at `invitedAt`. */
export function invitationExpiresAt(invitedAt: Date): Date {
  return new Date(invitedAt.getTime() + INVITATION_TTL_MS);
}

/**
 * Accept a pending invitation (INVITED → ACTIVE). Rejected if not INVITED or already past expiry —
 * an expired invite cannot be revived (FR-002a).
 */
export function accept(m: MembershipState, now: Date): Result<MembershipDelta> {
  if (m.status !== 'INVITED') {
    return err(DomainError.invariant(`Cannot accept an invitation in status ${m.status}`, { status: m.status }));
  }
  if (isInvitationExpired(m, now)) {
    return err(DomainError.invariant('Invitation has expired', { invitationExpiresAt: m.invitationExpiresAt }));
  }
  return ok({ status: 'ACTIVE', joinedAt: now });
}

/** Decline a pending invitation (INVITED → DECLINED). */
export function decline(m: MembershipState): Result<MembershipDelta> {
  if (m.status !== 'INVITED') {
    return err(DomainError.invariant(`Cannot decline an invitation in status ${m.status}`, { status: m.status }));
  }
  return ok({ status: 'DECLINED' });
}

/** Expire an unanswered invitation (INVITED → EXPIRED). Used by the invitation-expiry job (T036). */
export function expire(m: MembershipState, now: Date): Result<MembershipDelta> {
  if (!isInvitationExpired(m, now)) {
    return err(DomainError.invariant('Invitation is not yet expired', { invitationExpiresAt: m.invitationExpiresAt }));
  }
  return ok({ status: 'EXPIRED' });
}

/**
 * Leave a profile (ACTIVE → LEFT). The current OWNER must transfer ownership first (FR-007a); a sole
 * owner who wishes to exit archives the profile instead (FR-007c).
 */
export function leave(m: MembershipState, now: Date): Result<MembershipDelta> {
  if (m.status !== 'ACTIVE') {
    return err(DomainError.invariant(`Only ACTIVE members can leave (status ${m.status})`, { status: m.status }));
  }
  if (m.role === 'OWNER') {
    return err(DomainError.invariant('The owner must transfer ownership before leaving', { membershipId: m.id }));
  }
  return ok({ status: 'LEFT', leftAt: now });
}

/**
 * Change a member's role (FR-006). Cannot target the OWNER membership (ownership moves only via the
 * nominate-and-accept flow, FR-007b) and cannot assign OWNER directly.
 */
export function changeRole(m: MembershipState, role: MemberRole): Result<MembershipDelta> {
  if (m.status !== 'ACTIVE') {
    return err(DomainError.invariant(`Only ACTIVE members have a mutable role (status ${m.status})`, { status: m.status }));
  }
  if (m.role === 'OWNER') {
    return err(DomainError.invariant('Use ownership transfer to change the owner', { membershipId: m.id }));
  }
  if (role === 'OWNER') {
    return err(DomainError.invariant('OWNER is assigned only through ownership transfer (FR-007b)', { role }));
  }
  return ok({ role });
}

/**
 * Nominate an ACTIVE member as the next owner (FR-007b, step 1). The current owner retains ownership
 * until the nominee accepts. Marks the nominee `pendingOwnerNominee`.
 */
export function nominateOwner(nominee: MembershipState): Result<MembershipDelta> {
  if (nominee.status !== 'ACTIVE') {
    return err(DomainError.invariant('Owner nominee must be an ACTIVE member', { status: nominee.status }));
  }
  if (nominee.role === 'OWNER') {
    return err(DomainError.invariant('Nominee is already the owner', { membershipId: nominee.id }));
  }
  return ok({ pendingOwnerNominee: true });
}

export interface OwnershipTransferDeltas {
  /** Nominee becomes OWNER and the pending flag clears. */
  nominee: MembershipDelta;
  /** Outgoing owner steps down to ADMIN (retains profile access, loses owner authority). */
  outgoingOwner: MembershipDelta;
}

/**
 * Complete an ownership transfer (FR-007b, step 2): the nominated member accepts. Preserves the
 * single-owner invariant — exactly one OWNER before and after.
 */
export function acceptOwnership(
  nominee: MembershipState,
  currentOwner: MembershipState,
): Result<OwnershipTransferDeltas> {
  if (!nominee.pendingOwnerNominee) {
    return err(DomainError.invariant('No pending ownership nomination for this member', { membershipId: nominee.id }));
  }
  if (nominee.status !== 'ACTIVE') {
    return err(DomainError.invariant('Only an ACTIVE nominee can accept ownership', { status: nominee.status }));
  }
  if (currentOwner.role !== 'OWNER') {
    return err(DomainError.invariant('Current owner record is not OWNER', { membershipId: currentOwner.id }));
  }
  return ok({
    nominee: { role: 'OWNER', pendingOwnerNominee: false },
    outgoingOwner: { role: 'ADMIN' },
  });
}
