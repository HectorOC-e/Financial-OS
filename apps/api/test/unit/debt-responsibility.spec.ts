/**
 * Debt-responsibility unit tests (T077 — FR-020a). Defaults derive from contribution %, the set sums
 * to exactly 100%, and a departing member's share is reassigned proportionally to the rest — still
 * summing to 100% — via the largest-remainder allocator.
 */
import {
  defaultResponsibilities,
  reassignOnLeave,
  validateSumTo100,
  FULL_BP,
} from '../../src/modules/shared-elements/domain/debt-responsibility';

function sum(shares: { percentageBp: number }[]): number {
  return shares.reduce((s, r) => s + r.percentageBp, 0);
}

describe('defaultResponsibilities (FR-020a)', () => {
  it('defaults proportionally to contribution % and sums to exactly 100%', () => {
    const shares = defaultResponsibilities([
      { membershipId: 'a', percentageBp: 5000 },
      { membershipId: 'b', percentageBp: 2500 },
      { membershipId: 'c', percentageBp: 2500 },
    ]);
    expect(sum(shares)).toBe(FULL_BP);
    const a = shares.find((s) => s.membershipId === 'a')!;
    expect(a.percentageBp).toBe(5000); // 50000/(100) … proportional to weights
  });

  it('falls back to an equal split when all contributions are zero, still summing to 100%', () => {
    const shares = defaultResponsibilities([
      { membershipId: 'a', percentageBp: 0 },
      { membershipId: 'b', percentageBp: 0 },
      { membershipId: 'c', percentageBp: 0 },
    ]);
    expect(sum(shares)).toBe(FULL_BP);
    // Largest-remainder gives 3334/3333/3333 (stable tie-break by membershipId).
    expect(shares.map((s) => s.percentageBp).sort((x, y) => y - x)).toEqual([3334, 3333, 3333]);
  });
});

describe('validateSumTo100', () => {
  it('accepts a set summing to 10000', () => {
    expect(validateSumTo100([{ membershipId: 'a', percentageBp: 6000 }, { membershipId: 'b', percentageBp: 4000 }]).ok).toBe(true);
  });
  it('rejects a set that does not sum to 10000', () => {
    expect(validateSumTo100([{ membershipId: 'a', percentageBp: 6000 }, { membershipId: 'b', percentageBp: 3000 }]).ok).toBe(false);
  });
});

describe('reassignOnLeave (FR-020a)', () => {
  it('redistributes the departing share proportionally and still sums to 100%', () => {
    const after = reassignOnLeave(
      [
        { membershipId: 'a', percentageBp: 5000 },
        { membershipId: 'b', percentageBp: 3000 },
        { membershipId: 'c', percentageBp: 2000 },
      ],
      'a',
    );
    expect(after.map((s) => s.membershipId).sort()).toEqual(['b', 'c']);
    expect(sum(after)).toBe(FULL_BP);
    // b:c was 3000:2000 = 3:2 → 6000:4000.
    expect(after.find((s) => s.membershipId === 'b')!.percentageBp).toBe(6000);
    expect(after.find((s) => s.membershipId === 'c')!.percentageBp).toBe(4000);
  });

  it('hands 100% to the sole remaining member', () => {
    const after = reassignOnLeave(
      [{ membershipId: 'a', percentageBp: 7000 }, { membershipId: 'b', percentageBp: 3000 }],
      'a',
    );
    expect(after).toEqual([{ membershipId: 'b', percentageBp: 10000 }]);
  });
});
