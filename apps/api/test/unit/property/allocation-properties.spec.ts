/**
 * Property-based tests for the largest-remainder allocator and reconciliation invariants
 * (T115 — FR-024a / SC-005, Principle II).
 *
 * Uses a seeded deterministic PRNG (mulberry32) instead of a fuzzing library so every CI run
 * exercises exactly the same generated cases — failures are reproducible from the seed alone.
 */
import {
  AllocationWeight,
  Percentage,
  allocateByLargestRemainder,
} from '../../../src/common/money/percentage';

const CASES = 500;
const SEED = 0xf1a2c3;

/** mulberry32 — small deterministic PRNG; good enough distribution for case generation. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface GeneratedCase {
  totalCents: bigint;
  shares: AllocationWeight[];
}

function generateCase(rand: () => number): GeneratedCase {
  // Totals span tiny (residual-heavy) to beyond 32-bit (BigInt safety).
  const magnitude = Math.floor(rand() * 3);
  const totalCents =
    magnitude === 0
      ? BigInt(Math.floor(rand() * 100)) // 0–99 cents: residual dominates
      : magnitude === 1
        ? BigInt(Math.floor(rand() * 1_000_000)) // up to $10k
        : BigInt(Math.floor(rand() * 4_294_967_296)) * 1000n; // > 32-bit cents

  const memberCount = 1 + Math.floor(rand() * 20); // profile cap ~20 members
  const shares: AllocationWeight[] = Array.from({ length: memberCount }, (_, i) => ({
    membershipId: `m-${String(i).padStart(2, '0')}`,
    weightBp: Math.floor(rand() * 10001), // 0–10000 bp; zero weights included on purpose
  }));
  // Guarantee at least one positive weight so the proportional branch is exercised.
  if (shares.every((s) => s.weightBp === 0)) shares[0].weightBp = 1;
  return { totalCents, shares };
}

describe('largest-remainder allocator properties (T115)', () => {
  const rand = prng(SEED);
  const cases: GeneratedCase[] = Array.from({ length: CASES }, () => generateCase(rand));

  it(`Σ(parts) === total for all ${CASES} generated cases (exact reconciliation)`, () => {
    for (const c of cases) {
      const result = allocateByLargestRemainder(c.totalCents, c.shares);
      const sum = result.reduce((acc, r) => acc + r.amountCents, 0n);
      expect(sum).toBe(c.totalCents);
    }
  });

  it('every part is non-negative and within 1 cent of the exact proportional share', () => {
    for (const c of cases) {
      const totalWeight = c.shares.reduce((acc, s) => acc + BigInt(s.weightBp), 0n);
      const result = allocateByLargestRemainder(c.totalCents, c.shares);
      for (let i = 0; i < result.length; i++) {
        const part = result[i].amountCents;
        expect(part >= 0n).toBe(true);
        // floor share ≤ part ≤ floor share + 1 (Hamilton method bound)
        const floorShare = (c.totalCents * BigInt(c.shares[i].weightBp)) / totalWeight;
        expect(part === floorShare || part === floorShare + 1n).toBe(true);
      }
    }
  });

  it('zero-weight members never receive anything', () => {
    for (const c of cases) {
      const result = allocateByLargestRemainder(c.totalCents, c.shares);
      for (let i = 0; i < result.length; i++) {
        if (c.shares[i].weightBp === 0) expect(result[i].amountCents).toBe(0n);
      }
    }
  });

  it('is deterministic: identical input always yields identical output', () => {
    for (const c of cases.slice(0, 50)) {
      const a = allocateByLargestRemainder(c.totalCents, c.shares);
      const b = allocateByLargestRemainder(c.totalCents, c.shares);
      expect(b).toEqual(a);
    }
  });

  it('is order-independent: shuffling input order never changes any member amount', () => {
    const shuffleRand = prng(SEED ^ 0xdead);
    for (const c of cases.slice(0, 100)) {
      const baseline = new Map(
        allocateByLargestRemainder(c.totalCents, c.shares).map((r) => [r.membershipId, r.amountCents]),
      );
      const shuffled = [...c.shares].sort(() => (shuffleRand() < 0.5 ? -1 : 1));
      for (const r of allocateByLargestRemainder(c.totalCents, shuffled)) {
        expect(r.amountCents).toBe(baseline.get(r.membershipId));
      }
    }
  });
});

describe('percentage/standing reconciliation invariants (T115)', () => {
  const rand = prng(SEED ^ 0xbeef);

  it('applyToCents is bounded: 0 ≤ pct(amount) ≤ amount, monotone in bp', () => {
    for (let i = 0; i < CASES; i++) {
      const amount = BigInt(Math.floor(rand() * 4_294_967_296));
      const bpLow = Math.floor(rand() * 10001);
      const bpHigh = Math.min(10000, bpLow + Math.floor(rand() * (10001 - bpLow)));
      const low = Percentage.fromBasisPoints(bpLow).applyToCents(amount);
      const high = Percentage.fromBasisPoints(bpHigh).applyToCents(amount);
      expect(low >= 0n).toBe(true);
      expect(high <= amount).toBe(true);
      expect(low <= high).toBe(true);
    }
  });

  it('full allocation (10000 bp split across members) returns exactly the pool, never more', () => {
    for (let i = 0; i < 200; i++) {
      const pool = BigInt(Math.floor(rand() * 1_000_000_000));
      // Random partition of 10000 bp across 2–10 members.
      const memberCount = 2 + Math.floor(rand() * 9);
      const cuts = Array.from({ length: memberCount - 1 }, () => Math.floor(rand() * 10001)).sort((a, b) => a - b);
      const weights = [...cuts, 10000].map((c, idx) => c - (idx === 0 ? 0 : cuts[idx - 1]));
      const shares: AllocationWeight[] = weights.map((w, idx) => ({ membershipId: `m-${idx}`, weightBp: w }));

      const sum = allocateByLargestRemainder(pool, shares).reduce((acc, r) => acc + r.amountCents, 0n);
      expect(sum).toBe(pool); // SC-005: the pool reconciles exactly — no cent created or lost
    }
  });
});
