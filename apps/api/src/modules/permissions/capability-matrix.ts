import { MemberRole } from '@prisma/client';

/**
 * Explicit action → role capability matrix (R5 / FR-005 / FR-006). This is the single source of
 * truth for "who may do what" in a shared profile, enforced by PermissionsGuard (T026) and by
 * domain command handlers. Keeping it a plain data structure makes it exhaustively unit-testable.
 *
 * Role seniority (for reference): OWNER ⊃ ADMIN ⊃ CONTRIBUTOR ⊃ VIEWER.
 */
export enum Capability {
  // Reads
  VIEW_PROFILE = 'VIEW_PROFILE',
  // Membership / governance
  INVITE_MEMBER = 'INVITE_MEMBER',
  CHANGE_MEMBER_ROLE = 'CHANGE_MEMBER_ROLE',
  REMOVE_MEMBER = 'REMOVE_MEMBER',
  NOMINATE_OWNER = 'NOMINATE_OWNER',
  TRANSFER_OWNERSHIP = 'TRANSFER_OWNERSHIP',
  ARCHIVE_PROFILE = 'ARCHIVE_PROFILE',
  // Contributions
  SET_OWN_INCOME = 'SET_OWN_INCOME',
  SET_OWN_ALLOCATION = 'SET_OWN_ALLOCATION',
  RECORD_CONTRIBUTION = 'RECORD_CONTRIBUTION',
  REDISTRIBUTE_PERCENTAGES = 'REDISTRIBUTE_PERCENTAGES',
  // Shared elements
  MANAGE_SHARED_ELEMENTS = 'MANAGE_SHARED_ELEMENTS',
  SET_DEBT_RESPONSIBILITY = 'SET_DEBT_RESPONSIBILITY',
}

const MATRIX: Record<Capability, MemberRole[]> = {
  [Capability.VIEW_PROFILE]: [
    MemberRole.OWNER,
    MemberRole.ADMIN,
    MemberRole.CONTRIBUTOR,
    MemberRole.VIEWER,
  ],
  [Capability.INVITE_MEMBER]: [MemberRole.OWNER, MemberRole.ADMIN],
  [Capability.CHANGE_MEMBER_ROLE]: [MemberRole.OWNER, MemberRole.ADMIN],
  [Capability.REMOVE_MEMBER]: [MemberRole.OWNER, MemberRole.ADMIN],
  [Capability.NOMINATE_OWNER]: [MemberRole.OWNER],
  [Capability.TRANSFER_OWNERSHIP]: [MemberRole.OWNER],
  [Capability.ARCHIVE_PROFILE]: [MemberRole.OWNER],
  [Capability.SET_OWN_INCOME]: [MemberRole.OWNER, MemberRole.ADMIN, MemberRole.CONTRIBUTOR],
  [Capability.SET_OWN_ALLOCATION]: [MemberRole.OWNER, MemberRole.ADMIN, MemberRole.CONTRIBUTOR],
  [Capability.RECORD_CONTRIBUTION]: [MemberRole.OWNER, MemberRole.ADMIN, MemberRole.CONTRIBUTOR],
  [Capability.REDISTRIBUTE_PERCENTAGES]: [MemberRole.OWNER, MemberRole.ADMIN],
  [Capability.MANAGE_SHARED_ELEMENTS]: [MemberRole.OWNER, MemberRole.ADMIN],
  [Capability.SET_DEBT_RESPONSIBILITY]: [MemberRole.OWNER, MemberRole.ADMIN],
};

/** True iff `role` is permitted to perform `capability`. */
export function can(role: MemberRole, capability: Capability): boolean {
  return MATRIX[capability].includes(role);
}

export function rolesFor(capability: Capability): MemberRole[] {
  return [...MATRIX[capability]];
}
