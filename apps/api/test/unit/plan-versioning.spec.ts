/**
 * Plan-versioning unit tests (T068 — FR-016/FR-016a/SC-006). Redistribution increments the version
 * and validates ranges; immutability of prior snapshots is structural (a new version never touches
 * old rows) and is proven end-to-end by the US4 integration test.
 */
import { nextPlanVersion, validateRedistribution } from '../../src/modules/contributions/domain/redistribution';
import { DomainErrorCode } from '../../src/common/errors';

describe('nextPlanVersion (FR-016)', () => {
  it('starts at 1 when there is no plan yet', () => {
    expect(nextPlanVersion(null)).toBe(1);
    expect(nextPlanVersion(undefined)).toBe(1);
  });
  it('increments monotonically (new version, never overwrite)', () => {
    expect(nextPlanVersion(1)).toBe(2);
    expect(nextPlanVersion(7)).toBe(8);
  });
});

describe('validateRedistribution (FR-013)', () => {
  it('accepts in-range, unique allocations', () => {
    expect(
      validateRedistribution([
        { membershipId: 'a', percentageBp: 5000 },
        { membershipId: 'b', percentageBp: 2500 },
      ]).ok,
    ).toBe(true);
  });

  it('rejects an empty set', () => {
    expect(validateRedistribution([]).ok).toBe(false);
  });

  it('rejects duplicate memberships', () => {
    const res = validateRedistribution([
      { membershipId: 'a', percentageBp: 1000 },
      { membershipId: 'a', percentageBp: 2000 },
    ]);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe(DomainErrorCode.VALIDATION);
  });

  it.each([-1, 10001, 1.5])('rejects out-of-range percentage %p', (bp) => {
    const res = validateRedistribution([{ membershipId: 'a', percentageBp: bp }]);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe(DomainErrorCode.VALIDATION);
  });
});
