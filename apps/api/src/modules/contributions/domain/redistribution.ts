/**
 * Percentage redistribution / plan versioning (T069 — FR-016/FR-016a/SC-006).
 *
 * Pure and framework-free. Redistribution never mutates an existing plan version or a snapshotted
 * period — it produces a NEW plan version. Because each contribution period snapshots the plan
 * *version* it opened with (R7), prior and current periods keep referencing their original version's
 * allocations, so history is provably preserved; the new version applies only to periods opened
 * afterwards (forward-only).
 */
import { DomainError, Result, ok, err } from '../../../common/errors';

export interface RedistributionAllocation {
  membershipId: string;
  percentageBp: number;
}

/** Next plan version number (versions increment from 1; null ⇒ no plan yet). */
export function nextPlanVersion(currentVersion: number | null | undefined): number {
  return (currentVersion ?? 0) + 1;
}

/**
 * Validate a redistribution set: every per-profile allocation must be in range 0–100% (FR-013),
 * and a membership may appear at most once. The cross-profile 100% cap (FR-015a) is enforced by the
 * application layer, which has the member's commitments in other profiles.
 */
export function validateRedistribution(allocations: readonly RedistributionAllocation[]): Result<void> {
  if (allocations.length === 0) {
    return err(DomainError.validation('Redistribution requires at least one allocation'));
  }
  const seen = new Set<string>();
  for (const a of allocations) {
    if (seen.has(a.membershipId)) {
      return err(DomainError.validation('Duplicate membership in redistribution', { membershipId: a.membershipId }));
    }
    seen.add(a.membershipId);
    if (!Number.isInteger(a.percentageBp) || a.percentageBp < 0 || a.percentageBp > 10000) {
      return err(
        DomainError.validation(`Allocation must be 0–10000 basis points, got ${a.percentageBp}`, {
          membershipId: a.membershipId,
          percentageBp: a.percentageBp,
        }),
      );
    }
  }
  return ok(undefined);
}
