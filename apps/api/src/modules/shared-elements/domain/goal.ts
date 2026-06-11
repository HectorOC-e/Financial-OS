/**
 * SharedGoal funding domain (T078 — FR-020). Pure, integer cents. Funding adjusts `fundedAmount` by
 * the exact transacted amount; a goal becomes ACHIEVED once funding reaches its target.
 */
import { DomainError, Result, ok, err } from '../../../common/errors';

export type GoalStatus = 'ACTIVE' | 'ACHIEVED' | 'ARCHIVED';

export interface FundGoalResult {
  newFundedCents: bigint;
  status: GoalStatus;
}

/** Fund a goal by an exact positive amount; marks ACHIEVED when funding meets/exceeds the target. */
export function fundGoal(fundedCents: bigint, targetCents: bigint, amountCents: bigint): Result<FundGoalResult> {
  if (amountCents <= 0n) {
    return err(DomainError.validation('Funding amount must be positive', { amountCents: amountCents.toString() }));
  }
  const newFundedCents = fundedCents + amountCents;
  return ok({ newFundedCents, status: newFundedCents >= targetCents ? 'ACHIEVED' : 'ACTIVE' });
}
