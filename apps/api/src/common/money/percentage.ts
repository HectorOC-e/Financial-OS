/**
 * Percentage (basis points) + largest-remainder allocator.
 *
 * Percentages are integer basis points (0–10000 = 0–100%). Conversions to money are pure,
 * deterministic integer operations (Principle II). The largest-remainder allocator (FR-024a)
 * splits a fixed integer total across weighted shares so the parts reconcile **exactly** to
 * the total: floor each share, then hand the leftover minor units to the largest fractional
 * remainders, breaking ties by stable membership-ID ascending order.
 *
 * Framework-free (Principle IV).
 */

export const BASIS_POINTS_SCALE = 10000n; // 100% = 10000 bp

export class Percentage {
  private constructor(readonly basisPoints: number) {}

  /** 0–10000 inclusive; integer only. */
  static fromBasisPoints(bp: number): Percentage {
    if (!Number.isInteger(bp)) {
      throw new TypeError(`Percentage basis points must be an integer, got: ${bp}`);
    }
    if (bp < 0 || bp > 10000) {
      throw new RangeError(`Percentage basis points out of range [0,10000]: ${bp}`);
    }
    return new Percentage(bp);
  }

  static zero(): Percentage {
    return new Percentage(0);
  }

  /**
   * Apply this percentage to an integer-cents amount using floored integer division
   * (deterministic; no float). Residual cents from a multi-party split are reconciled by
   * `allocateByLargestRemainder`, not here.
   */
  applyToCents(amountCents: bigint): bigint {
    return (amountCents * BigInt(this.basisPoints)) / BASIS_POINTS_SCALE;
  }

  plus(other: Percentage): Percentage {
    return Percentage.fromBasisPoints(this.basisPoints + other.basisPoints);
  }
}

export interface AllocationWeight {
  /** Stable identifier used for deterministic tie-breaking (e.g. membership UUID). */
  membershipId: string;
  /** Relative weight (e.g. contribution basis points). Must be a non-negative integer. */
  weightBp: number;
}

export interface AllocationResult {
  membershipId: string;
  amountCents: bigint;
}

/**
 * Distribute `totalCents` across `shares` proportionally to their weights, guaranteeing
 * Σ(result) === totalCents (exact reconciliation — FR-024a / SC-005).
 *
 * Algorithm (largest remainder / Hamilton):
 *  1. floor_i = floor(total * weight_i / Σweight)
 *  2. residual = total - Σ floor_i   (always 0 ≤ residual < number-of-shares)
 *  3. assign one extra cent to the `residual` shares with the largest fractional remainders;
 *     ties broken by ascending membershipId so the result is fully deterministic.
 *
 * Requires totalCents ≥ 0 and at least one share with positive weight.
 */
export function allocateByLargestRemainder(
  totalCents: bigint,
  shares: AllocationWeight[],
): AllocationResult[] {
  if (totalCents < 0n) {
    throw new RangeError('allocateByLargestRemainder requires a non-negative total');
  }
  if (shares.length === 0) {
    return [];
  }

  let totalWeight = 0n;
  for (const s of shares) {
    if (!Number.isInteger(s.weightBp) || s.weightBp < 0) {
      throw new RangeError(`Allocation weight must be a non-negative integer: ${s.weightBp}`);
    }
    totalWeight += BigInt(s.weightBp);
  }

  // No positive weight anywhere: nothing can be distributed proportionally → all zero.
  if (totalWeight === 0n) {
    return shares.map((s) => ({ membershipId: s.membershipId, amountCents: 0n }));
  }

  const provisional = shares.map((s) => {
    const numerator = totalCents * BigInt(s.weightBp);
    const floorShare = numerator / totalWeight; // bigint division truncates toward zero == floor for ≥0
    const remainder = numerator - floorShare * totalWeight; // 0 ≤ remainder < totalWeight
    return { membershipId: s.membershipId, amountCents: floorShare, remainder };
  });

  let allocated = 0n;
  for (const p of provisional) {
    allocated += p.amountCents;
  }
  let residual = totalCents - allocated; // integer count of leftover cents

  // Order by largest remainder desc, then ascending membershipId for a stable, deterministic tie-break.
  const ranking = [...provisional].sort((a, b) => {
    if (a.remainder !== b.remainder) {
      return a.remainder > b.remainder ? -1 : 1;
    }
    if (a.membershipId < b.membershipId) return -1;
    if (a.membershipId > b.membershipId) return 1;
    return 0;
  });

  const bump = new Set<string>();
  for (let i = 0; i < ranking.length && residual > 0n; i++) {
    bump.add(ranking[i].membershipId);
    residual -= 1n;
  }

  // Preserve the caller's original ordering in the result.
  return provisional.map((p) => ({
    membershipId: p.membershipId,
    amountCents: bump.has(p.membershipId) ? p.amountCents + 1n : p.amountCents,
  }));
}
