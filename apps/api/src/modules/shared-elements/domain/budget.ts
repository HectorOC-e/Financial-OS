/**
 * SharedInvestment + period-scoped SharedBudget domain (T081 — FR-018/analysis I2). Pure, integer
 * cents. A budget is scoped to a contribution period; `remaining = limit − spent`, reflected exactly
 * as spending is recorded. `spent` resets each period because a new budget row is created per period.
 */
import { DomainError, Result, ok, err } from '../../../common/errors';

export interface RecordSpendResult {
  newSpentCents: bigint;
  remainingCents: bigint;
}

/** Remaining budget = limit − spent (may be negative if overspent — surfaced, never silently clamped). */
export function remainingCents(limitCents: bigint, spentCents: bigint): bigint {
  return limitCents - spentCents;
}

/** Record spending against a budget by an exact positive amount. */
export function recordSpend(limitCents: bigint, spentCents: bigint, amountCents: bigint): Result<RecordSpendResult> {
  if (amountCents <= 0n) {
    return err(DomainError.validation('Spend amount must be positive', { amountCents: amountCents.toString() }));
  }
  const newSpentCents = spentCents + amountCents;
  return ok({ newSpentCents, remainingCents: limitCents - newSpentCents });
}

/** Update a shared investment's current value (non-negative). */
export function updateInvestmentValue(currentValueCents: bigint, newValueCents: bigint): Result<bigint> {
  if (newValueCents < 0n) {
    return err(DomainError.validation('Investment value cannot be negative', { newValueCents: newValueCents.toString() }));
  }
  return ok(newValueCents);
}
