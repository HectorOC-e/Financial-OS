/**
 * Single-currency-per-profile guard (T111 — CHK041). Pure domain: same currency passes,
 * any other currency is rejected with CURRENCY_MISMATCH and structured details.
 */
import { DomainErrorCode, isErr, isOk } from '../../src/common/errors';
import { ensureProfileCurrency } from '../../src/modules/shared-elements/domain/currency-guard';

describe('currency guard (T111)', () => {
  it('accepts the profile base currency', () => {
    expect(isOk(ensureProfileCurrency('USD', 'USD'))).toBe(true);
  });

  it('is case-insensitive on ISO 4217 codes', () => {
    expect(isOk(ensureProfileCurrency('USD', 'usd'))).toBe(true);
  });

  it('rejects any other currency with CURRENCY_MISMATCH', () => {
    const result = ensureProfileCurrency('USD', 'EUR', { accountId: 'acc-1' });
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe(DomainErrorCode.CURRENCY_MISMATCH);
      expect(result.error.details).toMatchObject({
        profileBaseCurrency: 'USD',
        candidateCurrency: 'EUR',
        accountId: 'acc-1',
      });
    }
  });
});
