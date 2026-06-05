/**
 * Pure analytics core (Principle X / Principle II). Single source of truth for contribution,
 * standing, and pool computations — reused by GraphQL resolvers, exports, and the read-only AI
 * coaching projection. Framework-free and deterministic: integer cents only, no I/O, no clock.
 */
import { Percentage } from '../../../../common/money/percentage';

export type StandingState = 'ON_TRACK' | 'AHEAD' | 'BEHIND';

export interface MemberExpectation {
  membershipId: string;
  /** Snapshotted declared income for the period (cents). */
  incomeCents: bigint;
  /** Allocation for the period (basis points, 0–10000). */
  percentageBp: number;
}

export interface ContributionStanding {
  expectedCents: bigint;
  actualCents: bigint;
  /** actual − expected. Negative ⇒ behind, positive ⇒ ahead. */
  varianceCents: bigint;
  state: StandingState;
}

/** Expected contribution = income × percentage, floored to whole cents (deterministic). */
export function expectedContributionCents(incomeCents: bigint, percentageBp: number): bigint {
  return Percentage.fromBasisPoints(percentageBp).applyToCents(incomeCents);
}

/** Total expected across all members for a period. */
export function poolExpectedTotalCents(expectations: MemberExpectation[]): bigint {
  return expectations.reduce(
    (sum, e) => sum + expectedContributionCents(e.incomeCents, e.percentageBp),
    0n,
  );
}

/**
 * The pool is emergent (FR-015): the exact sum of actual recorded contributions. Reconciles to the
 * sum of per-member records with zero variance (SC-005).
 */
export function poolActualTotalCents(recordAmountsCents: bigint[]): bigint {
  return recordAmountsCents.reduce((sum, a) => sum + a, 0n);
}

/** Standing of a member: expected (snapshot) vs actual (sum of their records). */
export function computeStanding(expectedCents: bigint, actualCents: bigint): ContributionStanding {
  const varianceCents = actualCents - expectedCents;
  let state: StandingState;
  if (varianceCents === 0n) {
    state = 'ON_TRACK';
  } else if (varianceCents > 0n) {
    state = 'AHEAD';
  } else {
    state = 'BEHIND';
  }
  return { expectedCents, actualCents, varianceCents, state };
}
