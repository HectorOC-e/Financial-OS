/**
 * DebtResponsibility domain (T080 — FR-020a). Pure, framework-free.
 *
 * Per-member responsibility shares for a shared debt sum to exactly 100% (10000 bp). Defaults derive
 * from each member's contribution percentage; on a member leaving, their share is reassigned
 * proportionally to the remaining members. Both operations use the largest-remainder allocator so the
 * shares reconcile to exactly 10000 deterministically (FR-024a).
 */
import { DomainError, Result, ok, err } from '../../../common/errors';
import { allocateByLargestRemainder } from '../../../common/money/percentage';

export const FULL_BP = 10000;

export interface ResponsibilityShare {
  membershipId: string;
  percentageBp: number;
}

export interface ContributionWeight {
  membershipId: string;
  /** Contribution percentage (bp) used as the default weighting. */
  percentageBp: number;
}

function allocateBp(weights: { membershipId: string; weightBp: number }[]): ResponsibilityShare[] {
  // If every weight is zero, fall back to equal weighting so the split is still well-defined.
  const allZero = weights.every((w) => w.weightBp === 0);
  const normalized = allZero ? weights.map((w) => ({ ...w, weightBp: 1 })) : weights;
  return allocateByLargestRemainder(BigInt(FULL_BP), normalized).map((r) => ({
    membershipId: r.membershipId,
    percentageBp: Number(r.amountCents),
  }));
}

/** Default responsibility shares from members' contribution percentages, summing to exactly 100%. */
export function defaultResponsibilities(contributions: readonly ContributionWeight[]): ResponsibilityShare[] {
  if (contributions.length === 0) return [];
  return allocateBp(contributions.map((c) => ({ membershipId: c.membershipId, weightBp: c.percentageBp })));
}

/** A responsibility set is valid only if it sums to exactly 100% (FR-020a). */
export function validateSumTo100(shares: readonly ResponsibilityShare[]): Result<void> {
  const sum = shares.reduce((s, r) => s + r.percentageBp, 0);
  if (sum !== FULL_BP) {
    return err(DomainError.invariant(`Debt responsibilities must sum to 100% (10000 bp), got ${sum}`, { sumBp: sum }));
  }
  return ok(undefined);
}

/**
 * Reassign a departing member's share proportionally to the remaining members (FR-020a). The result
 * sums to exactly 10000; proportions follow the remaining members' existing shares.
 */
export function reassignOnLeave(
  shares: readonly ResponsibilityShare[],
  leavingMembershipId: string,
): ResponsibilityShare[] {
  const remaining = shares.filter((s) => s.membershipId !== leavingMembershipId);
  if (remaining.length === 0) return [];
  return allocateBp(remaining.map((s) => ({ membershipId: s.membershipId, weightBp: s.percentageBp })));
}
