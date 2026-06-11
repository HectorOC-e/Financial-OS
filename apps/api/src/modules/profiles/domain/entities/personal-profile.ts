/**
 * PersonalProfile domain entity (T032, FR-001/FR-004).
 *
 * A user's private profile — never visible to other users. There are no shared-state invariants here
 * beyond the one-per-user rule (enforced by a unique constraint in the schema); the type exists so the
 * domain layer can reason about profile ownership without depending on persistence types.
 */
export interface PersonalProfileState {
  id: string;
  userId: string;
}

/** A personal profile is visible only to its owning user (FR-004). */
export function isVisibleTo(profile: PersonalProfileState, requesterUserId: string): boolean {
  return profile.userId === requesterUserId;
}
