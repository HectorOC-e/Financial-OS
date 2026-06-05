import { Money, CurrencyMismatchError, InvalidCurrencyError } from '../../src/common/money/money';

describe('Money value object (FR-024 / analysis I1)', () => {
  describe('construction', () => {
    it('builds from bigint, integer number, and integer string', () => {
      expect(Money.of(150n, 'USD').toCentsString()).toBe('150');
      expect(Money.of(150, 'usd').toCentsString()).toBe('150');
      expect(Money.of('150', 'USD').toCentsString()).toBe('150');
    });

    it('normalizes the currency code to upper-case', () => {
      expect(Money.of(1n, 'usd').currency).toBe('USD');
    });

    it('rejects non-integer number input (no floating point)', () => {
      expect(() => Money.of(1.5, 'USD')).toThrow(TypeError);
    });

    it('rejects non-integer string input', () => {
      expect(() => Money.of('1.50', 'USD')).toThrow(TypeError);
    });

    it('rejects invalid currency codes', () => {
      expect(() => Money.of(1n, 'US')).toThrow(InvalidCurrencyError);
      expect(() => Money.of(1n, 'DOLLAR')).toThrow(InvalidCurrencyError);
    });
  });

  describe('arithmetic (integer cents only)', () => {
    it('adds and subtracts same-currency amounts exactly', () => {
      expect(Money.of(100n, 'USD').plus(Money.of(250n, 'USD')).toCentsString()).toBe('350');
      expect(Money.of(100n, 'USD').minus(Money.of(250n, 'USD')).toCentsString()).toBe('-150');
    });

    it('scales by an integer factor', () => {
      expect(Money.of(100n, 'USD').times(3).toCentsString()).toBe('300');
      expect(Money.of(100n, 'USD').times(3n).toCentsString()).toBe('300');
    });

    it('rejects non-integer scale factors', () => {
      expect(() => Money.of(100n, 'USD').times(1.5)).toThrow(TypeError);
    });
  });

  describe('same-currency guard', () => {
    it('throws CurrencyMismatchError on cross-currency add/subtract/compare', () => {
      const usd = Money.of(100n, 'USD');
      const eur = Money.of(100n, 'EUR');
      expect(() => usd.plus(eur)).toThrow(CurrencyMismatchError);
      expect(() => usd.minus(eur)).toThrow(CurrencyMismatchError);
      expect(() => usd.compareTo(eur)).toThrow(CurrencyMismatchError);
    });
  });

  describe('comparison & predicates', () => {
    it('orders amounts of the same currency', () => {
      expect(Money.of(1n, 'USD').lessThan(Money.of(2n, 'USD'))).toBe(true);
      expect(Money.of(2n, 'USD').greaterThan(Money.of(1n, 'USD'))).toBe(true);
      expect(Money.of(2n, 'USD').greaterThanOrEqual(Money.of(2n, 'USD'))).toBe(true);
    });

    it('reports sign and zero', () => {
      expect(Money.zero('USD').isZero()).toBe(true);
      expect(Money.of(-1n, 'USD').isNegative()).toBe(true);
      expect(Money.of(1n, 'USD').isPositive()).toBe(true);
    });

    it('equals compares both amount and currency', () => {
      expect(Money.of(1n, 'USD').equals(Money.of(1n, 'USD'))).toBe(true);
      expect(Money.of(1n, 'USD').equals(Money.of(1n, 'EUR'))).toBe(false);
    });
  });

  describe('large values / no overflow (64-bit-and-beyond via bigint)', () => {
    it('handles values far above the 32-bit Int ceiling without precision loss', () => {
      // ~$92.2 trillion in cents — well beyond 32-bit (~$21.5M) and JS Number.MAX_SAFE_INTEGER.
      const huge = 9_223_372_036_854_775_807n;
      const a = Money.of(huge, 'USD');
      const b = Money.of(1n, 'USD');
      expect(a.plus(b).toCentsString()).toBe('9223372036854775808');
    });

    it('multiplies large amounts exactly', () => {
      const a = Money.of(10_000_000_000n, 'USD');
      expect(a.times(1_000_000n).toCentsString()).toBe('10000000000000000');
    });
  });
});
