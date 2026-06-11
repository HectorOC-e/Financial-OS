/**
 * Contribution calculator unit tests (T047 — constitution: deterministic, integer cents, no float).
 * expected = declared income × percentage (basis points), floored; zero income → zero (FR-013/FR-015).
 */
import { expectedContributionCents, poolExpectedTotalCents } from '../../src/modules/contributions/domain/contribution-plan';

describe('expectedContributionCents (FR-013/FR-015)', () => {
  it('computes income × percentage in whole cents', () => {
    expect(expectedContributionCents(100_00n, 2500)).toBe(25_00n); // 25% of $100.00 = $25.00
    expect(expectedContributionCents(100_00n, 10000)).toBe(100_00n); // 100%
    expect(expectedContributionCents(100_00n, 0)).toBe(0n); // 0%
  });

  it('floors deterministically (no float, no rounding up)', () => {
    // 33.33% of 1000 cents = 333.3 → floored to 333.
    expect(expectedContributionCents(1000n, 3333)).toBe(333n);
    // 1 bp of 1 cent = 0.0001 → 0.
    expect(expectedContributionCents(1n, 1)).toBe(0n);
  });

  it('returns zero when income is zero regardless of percentage', () => {
    expect(expectedContributionCents(0n, 5000)).toBe(0n);
    expect(expectedContributionCents(0n, 10000)).toBe(0n);
  });

  it('handles 64-bit-scale values without overflow', () => {
    const big = 9_000_000_000_000n; // 90 billion dollars in cents
    expect(expectedContributionCents(big, 5000)).toBe(4_500_000_000_000n);
  });

  it('sums a pool deterministically across members', () => {
    const total = poolExpectedTotalCents([
      { membershipId: 'a', incomeCents: 200_000n, percentageBp: 1000 }, // 20000
      { membershipId: 'b', incomeCents: 500_000n, percentageBp: 2000 }, // 100000
    ]);
    expect(total).toBe(120_000n);
  });
});
