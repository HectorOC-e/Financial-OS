import {
  Percentage,
  allocateByLargestRemainder,
  AllocationWeight,
} from '../../src/common/money/percentage';

describe('Percentage (basis points)', () => {
  it('accepts 0..10000 and rejects out-of-range / non-integer', () => {
    expect(Percentage.fromBasisPoints(0).basisPoints).toBe(0);
    expect(Percentage.fromBasisPoints(10000).basisPoints).toBe(10000);
    expect(() => Percentage.fromBasisPoints(10001)).toThrow(RangeError);
    expect(() => Percentage.fromBasisPoints(-1)).toThrow(RangeError);
    expect(() => Percentage.fromBasisPoints(12.5)).toThrow(TypeError);
  });

  it('applies a percentage to cents with floored integer division (no float)', () => {
    // 33.33% of 100 cents = 33.33 → floor 33
    expect(Percentage.fromBasisPoints(3333).applyToCents(100n)).toBe(33n);
    // 25% of 101 cents = 25.25 → floor 25
    expect(Percentage.fromBasisPoints(2500).applyToCents(101n)).toBe(25n);
  });
});

describe('allocateByLargestRemainder (FR-024a, exact reconciliation SC-005)', () => {
  const sum = (rs: { amountCents: bigint }[]): bigint => rs.reduce((a, r) => a + r.amountCents, 0n);

  it('splits evenly when shares divide cleanly', () => {
    const shares: AllocationWeight[] = [
      { membershipId: 'a', weightBp: 5000 },
      { membershipId: 'b', weightBp: 5000 },
    ];
    const result = allocateByLargestRemainder(100n, shares);
    expect(result).toEqual([
      { membershipId: 'a', amountCents: 50n },
      { membershipId: 'b', amountCents: 50n },
    ]);
    expect(sum(result)).toBe(100n);
  });

  it('distributes the residual cent to the largest remainder', () => {
    // 100 cents split 1/3 : 2/3 → floors 33,66 (=99); residual 1 cent to the largest remainder.
    const shares: AllocationWeight[] = [
      { membershipId: 'a', weightBp: 3333 },
      { membershipId: 'b', weightBp: 6667 },
    ];
    const result = allocateByLargestRemainder(100n, shares);
    expect(sum(result)).toBe(100n);
    // b's fractional remainder is larger, so b gets the extra cent.
    expect(result.find((r) => r.membershipId === 'b')!.amountCents).toBe(67n);
    expect(result.find((r) => r.membershipId === 'a')!.amountCents).toBe(33n);
  });

  it('breaks remainder ties by ascending membershipId (deterministic)', () => {
    // 10 cents across three equal thirds → floors 3,3,3 (=9); residual 1.
    // All remainders equal → the lowest membershipId ('a') wins the extra cent.
    const shares: AllocationWeight[] = [
      { membershipId: 'c', weightBp: 3333 },
      { membershipId: 'a', weightBp: 3333 },
      { membershipId: 'b', weightBp: 3333 },
    ];
    const result = allocateByLargestRemainder(10n, shares);
    expect(sum(result)).toBe(10n);
    expect(result.find((r) => r.membershipId === 'a')!.amountCents).toBe(4n);
    expect(result.find((r) => r.membershipId === 'b')!.amountCents).toBe(3n);
    expect(result.find((r) => r.membershipId === 'c')!.amountCents).toBe(3n);
  });

  it('preserves the input ordering in the result', () => {
    const shares: AllocationWeight[] = [
      { membershipId: 'z', weightBp: 2500 },
      { membershipId: 'y', weightBp: 2500 },
      { membershipId: 'x', weightBp: 5000 },
    ];
    const result = allocateByLargestRemainder(99n, shares);
    expect(result.map((r) => r.membershipId)).toEqual(['z', 'y', 'x']);
    expect(sum(result)).toBe(99n);
  });

  it('reconciles exactly for awkward totals and many shares', () => {
    const shares: AllocationWeight[] = Array.from({ length: 7 }, (_, i) => ({
      membershipId: String.fromCharCode(97 + i),
      weightBp: 1428, // 7 * 1428 = 9996, not a clean divisor
    }));
    for (const total of [1n, 7n, 13n, 100n, 999n, 1_000_001n]) {
      const result = allocateByLargestRemainder(total, shares);
      expect(sum(result)).toBe(total);
    }
  });

  it('returns all-zero when no share has positive weight', () => {
    const result = allocateByLargestRemainder(100n, [
      { membershipId: 'a', weightBp: 0 },
      { membershipId: 'b', weightBp: 0 },
    ]);
    expect(result).toEqual([
      { membershipId: 'a', amountCents: 0n },
      { membershipId: 'b', amountCents: 0n },
    ]);
  });

  it('rejects a negative total', () => {
    expect(() => allocateByLargestRemainder(-1n, [{ membershipId: 'a', weightBp: 1 }])).toThrow(
      RangeError,
    );
  });
});
