/**
 * SharedDebt / SharedCreditCard payment domain (T079 — FR-020/FR-020b/FR-024).
 *
 * Pure, framework-free, integer cents. A payment reduces the outstanding balance by the exact amount;
 * overpayment (amount > outstanding) is REJECTED (FR-020b) so the balance can never go below zero.
 */
import { DomainError, Result, ok, err } from '../../../common/errors';

export interface PayDebtResult {
  newOutstandingCents: bigint;
  paidCents: bigint;
}

/** Apply a payment to an outstanding balance, rejecting non-positive amounts and overpayment. */
export function payDebt(outstandingCents: bigint, amountCents: bigint): Result<PayDebtResult> {
  if (amountCents <= 0n) {
    return err(DomainError.validation('Payment amount must be positive', { amountCents: amountCents.toString() }));
  }
  if (amountCents > outstandingCents) {
    return err(
      DomainError.overpayment('Payment exceeds the outstanding balance', {
        amountCents: amountCents.toString(),
        outstandingCents: outstandingCents.toString(),
      }),
    );
  }
  return ok({ newOutstandingCents: outstandingCents - amountCents, paidCents: amountCents });
}
