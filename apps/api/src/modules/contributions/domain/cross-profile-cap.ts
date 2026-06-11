/**
 * Cross-profile allocation cap (T050 — FR-015a). Pure and framework-free (Principle IV/II).
 *
 * A member may commit at most 100% (10000 bp) of their income summed across ALL the shared profiles
 * they belong to. This module aggregates a member's existing commitments and validates a proposed
 * change to one profile, returning the remaining headroom on rejection so the UI can guide the user.
 */
import { DomainError, Result, ok, err } from '../../../common/errors';

export const FULL_ALLOCATION_BP = 10000;

export interface ProfileCommitment {
  sharedProfileId: string;
  percentageBp: number;
}

/** Total basis points a member has committed across the given profiles. */
export function committedTotalBp(commitments: readonly ProfileCommitment[]): number {
  return commitments.reduce((sum, c) => sum + c.percentageBp, 0);
}

/** Headroom remaining before hitting 100% across all profiles (never negative). */
export function remainingBp(commitments: readonly ProfileCommitment[]): number {
  return Math.max(0, FULL_ALLOCATION_BP - committedTotalBp(commitments));
}

/**
 * Validate setting `newBp` for `targetProfileId`, given the member's CURRENT commitments across all
 * profiles. The target profile's existing commitment (if any) is replaced, not added. Rejects with
 * CAP_EXCEEDED (carrying the remaining headroom excluding the target) when the new total would exceed
 * 100%, and with VALIDATION when `newBp` is out of the per-profile 0–100% range (FR-013).
 */
export function checkAllocationWithinCap(
  current: readonly ProfileCommitment[],
  targetProfileId: string,
  newBp: number,
): Result<void> {
  if (!Number.isInteger(newBp) || newBp < 0 || newBp > FULL_ALLOCATION_BP) {
    return err(DomainError.validation(`Allocation must be 0–10000 basis points, got ${newBp}`, { percentageBp: newBp }));
  }
  const others = current.filter((c) => c.sharedProfileId !== targetProfileId);
  const othersTotal = committedTotalBp(others);
  if (othersTotal + newBp > FULL_ALLOCATION_BP) {
    return err(
      DomainError.capExceeded('Allocation would exceed 100% across all your profiles', {
        remainingBp: Math.max(0, FULL_ALLOCATION_BP - othersTotal),
        requestedBp: newBp,
        committedElsewhereBp: othersTotal,
      }),
    );
  }
  return ok(undefined);
}
