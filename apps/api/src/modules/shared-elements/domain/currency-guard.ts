/**
 * Single-currency-per-profile guard (T111 — design-gate CHK041).
 *
 * A shared profile carries exactly one base currency; every monetary amount that enters a shared
 * financial path (contributions from personal accounts, goal funding, debt payments, budgets) is
 * denominated in it. Any value arriving with a different currency is rejected deterministically
 * with CURRENCY_MISMATCH — there is no implicit conversion anywhere in the system (Principle II).
 *
 * Pure and framework-free (Principle IV).
 */
import { DomainError, DomainErrorCode, Result, ok, err } from '../../../common/errors';

/** Reject any currency that differs from the profile's base currency (case-insensitive ISO 4217). */
export function ensureProfileCurrency(
  profileBaseCurrency: string,
  candidateCurrency: string,
  context?: Record<string, unknown>,
): Result<void> {
  if (profileBaseCurrency.toUpperCase() === candidateCurrency.toUpperCase()) {
    return ok(undefined);
  }
  return err(
    new DomainError(
      DomainErrorCode.CURRENCY_MISMATCH,
      `This profile operates in ${profileBaseCurrency}; ${candidateCurrency} amounts are not accepted`,
      { profileBaseCurrency, candidateCurrency, ...context },
    ),
  );
}
