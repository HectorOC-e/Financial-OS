/**
 * Cross-profile 100% cap unit tests (T049 — FR-015a). Sum across all a member's profiles ≤ 100%;
 * rejection returns the remaining headroom; per-profile value constrained to 0–100% (FR-013).
 */
import {
  checkAllocationWithinCap,
  committedTotalBp,
  remainingBp,
  ProfileCommitment,
} from '../../src/modules/contributions/domain/cross-profile-cap';
import { DomainErrorCode } from '../../src/common/errors';

const commitments: ProfileCommitment[] = [
  { sharedProfileId: 'p1', percentageBp: 4000 },
  { sharedProfileId: 'p2', percentageBp: 3000 },
];

describe('committed / remaining', () => {
  it('totals committed basis points', () => {
    expect(committedTotalBp(commitments)).toBe(7000);
  });
  it('reports remaining headroom, never negative', () => {
    expect(remainingBp(commitments)).toBe(3000);
    expect(remainingBp([{ sharedProfileId: 'p', percentageBp: 12000 }])).toBe(0);
  });
});

describe('checkAllocationWithinCap (FR-015a)', () => {
  it('allows a new allocation within the remaining headroom', () => {
    expect(checkAllocationWithinCap(commitments, 'p3', 3000).ok).toBe(true);
  });

  it('replaces (not adds) the target profile’s existing commitment', () => {
    // Raising p1 from 4000 → 7000 leaves p2(3000)+7000 = 10000 ≤ 100%.
    expect(checkAllocationWithinCap(commitments, 'p1', 7000).ok).toBe(true);
  });

  it('rejects when the new total would exceed 100%, reporting remaining headroom', () => {
    const res = checkAllocationWithinCap(commitments, 'p3', 4000); // 7000 + 4000 = 11000
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe(DomainErrorCode.CAP_EXCEEDED);
      expect(res.error.details).toMatchObject({ remainingBp: 3000, requestedBp: 4000 });
    }
  });

  it('rejects out-of-range percentages (FR-013)', () => {
    expect(checkAllocationWithinCap([], 'p1', -1).ok).toBe(false);
    const tooBig = checkAllocationWithinCap([], 'p1', 10001);
    expect(tooBig.ok).toBe(false);
    if (!tooBig.ok) expect(tooBig.error.code).toBe(DomainErrorCode.VALIDATION);
  });
});
