/**
 * Account domain (T093 — FR-010/FR-010a). Pure, framework-free, integer cents.
 *
 * An account belongs to exactly one profile (personal OR shared) and is never linked to multiple
 * profiles. Personal accounts are excluded from shared-pool calculations unless their owner explicitly
 * contributes — and then only the contributed amount enters the pool, not the account balance.
 * CREDIT_CARD/DEBT balances must never go below zero via normal operations (FR-024).
 */
import { DomainError, Result, ok, err } from '../../../common/errors';

export type AccountProfileType = 'PERSONAL' | 'SHARED';
export type AccountType = 'WALLET' | 'ACCOUNT' | 'INVESTMENT' | 'EMERGENCY_FUND' | 'CREDIT_CARD' | 'DEBT';

export const ACCOUNT_TYPES: readonly AccountType[] = [
  'WALLET',
  'ACCOUNT',
  'INVESTMENT',
  'EMERGENCY_FUND',
  'CREDIT_CARD',
  'DEBT',
];

export function isPersonal(profileType: AccountProfileType): boolean {
  return profileType === 'PERSONAL';
}

/** Validate an opening balance: non-negative integer cents. */
export function validateOpeningBalance(balanceCents: bigint): Result<void> {
  if (balanceCents < 0n) {
    return err(DomainError.validation('Opening balance cannot be negative', { balanceCents: balanceCents.toString() }));
  }
  return ok(undefined);
}

/**
 * Withdraw `amountCents` from a personal account to contribute to a shared pool (FR-010). Only the
 * contributed amount leaves the account; the rest of the balance stays personal and isolated. The
 * amount must be positive and may not exceed the available balance.
 */
export function withdrawForContribution(balanceCents: bigint, amountCents: bigint): Result<{ newBalanceCents: bigint }> {
  if (amountCents <= 0n) {
    return err(DomainError.validation('Contribution amount must be positive', { amountCents: amountCents.toString() }));
  }
  if (amountCents > balanceCents) {
    return err(DomainError.validation('Insufficient account balance for this contribution', {
      amountCents: amountCents.toString(),
      balanceCents: balanceCents.toString(),
    }));
  }
  return ok({ newBalanceCents: balanceCents - amountCents });
}
