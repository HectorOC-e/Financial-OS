/**
 * Overpayment rejection unit tests (T076 — FR-020b/FR-024). Payment ≤ outstanding; balance never
 * below zero; goals fund by exact amount; budgets track spend exactly.
 */
import { payDebt } from '../../src/modules/shared-elements/domain/debt';
import { fundGoal } from '../../src/modules/shared-elements/domain/goal';
import { recordSpend, remainingCents } from '../../src/modules/shared-elements/domain/budget';
import { DomainErrorCode } from '../../src/common/errors';

describe('payDebt (FR-020b)', () => {
  it('reduces the balance by the exact amount', () => {
    const res = payDebt(100_00n, 30_00n);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.newOutstandingCents).toBe(70_00n);
  });

  it('allows paying off exactly to zero', () => {
    const res = payDebt(50_00n, 50_00n);
    expect(res.ok && res.value.newOutstandingCents).toBe(0n);
  });

  it('rejects overpayment and leaves the balance unchanged', () => {
    const res = payDebt(40_00n, 40_01n);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe(DomainErrorCode.OVERPAYMENT);
  });

  it('rejects non-positive amounts', () => {
    expect(payDebt(10_00n, 0n).ok).toBe(false);
    expect(payDebt(10_00n, -5n).ok).toBe(false);
  });
});

describe('fundGoal (FR-020)', () => {
  it('adds the exact amount and stays ACTIVE below target', () => {
    const res = fundGoal(0n, 100_00n, 25_00n);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.newFundedCents).toBe(25_00n);
      expect(res.value.status).toBe('ACTIVE');
    }
  });

  it('marks ACHIEVED when funding meets the target', () => {
    const res = fundGoal(80_00n, 100_00n, 20_00n);
    expect(res.ok && res.value.status).toBe('ACHIEVED');
  });
});

describe('budget (FR-018)', () => {
  it('computes remaining = limit − spent and tracks spend exactly', () => {
    const res = recordSpend(100_00n, 20_00n, 30_00n);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.newSpentCents).toBe(50_00n);
      expect(res.value.remainingCents).toBe(50_00n);
    }
    expect(remainingCents(100_00n, 120_00n)).toBe(-20_00n); // overspend surfaced, not clamped
  });
});
