/**
 * ContributionPlan / ContributionAllocation domain (T048 — FR-013/FR-015/FR-016).
 *
 * Pure, framework-free. A plan is a versioned set of per-member percentage allocations effective from
 * a period forward; redistribution creates a NEW version (handled in US4). The deterministic
 * "expected = income × percentage" calculator lives in the shared analytics core (Principle X) and is
 * re-exported here as the canonical entry point for contribution math.
 */
export { expectedContributionCents, poolExpectedTotalCents } from './analytics/analytics';

export interface ContributionPlanState {
  id: string;
  sharedProfileId: string;
  version: number;
  effectiveFromPeriodId: string | null;
}

export interface ContributionAllocationState {
  id: string;
  membershipId: string;
  percentageBp: number;
  version: number;
}

/** A member's expected contribution for a set of (income, percentage) inputs — convenience wrapper. */
export interface MemberAllocationView {
  membershipId: string;
  percentageBp: number;
}
