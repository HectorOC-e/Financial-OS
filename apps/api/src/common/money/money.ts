/**
 * Money value object — 64-bit integer minor units (cents) as `bigint`.
 *
 * Constitution Principle II (deterministic) + VIII (server-side money) + Architectural
 * Constraints + analysis I1 (FR-024): all monetary arithmetic uses integer cents stored as
 * `bigint`. No floating point ever enters a financial path. Arithmetic is only permitted
 * between identical currencies; cross-currency operations throw deterministically.
 *
 * This file is framework-free (Principle IV): no NestJS, Prisma, or I/O imports.
 */

export type CurrencyCode = string; // ISO 4217 alpha-3, normalized upper-case (e.g. 'USD')

export class CurrencyMismatchError extends Error {
  constructor(
    readonly left: CurrencyCode,
    readonly right: CurrencyCode,
  ) {
    super(`Currency mismatch: ${left} vs ${right}`);
    this.name = 'CurrencyMismatchError';
  }
}

export class InvalidCurrencyError extends Error {
  constructor(readonly value: string) {
    super(`Invalid ISO 4217 currency code: ${value}`);
    this.name = 'InvalidCurrencyError';
  }
}

function normalizeCurrency(code: CurrencyCode): CurrencyCode {
  const upper = code.toUpperCase();
  if (!/^[A-Z]{3}$/.test(upper)) {
    throw new InvalidCurrencyError(code);
  }
  return upper;
}

export class Money {
  private constructor(
    /** Integer minor units (cents). 64-bit-safe via bigint — cannot overflow. */
    readonly amountCents: bigint,
    readonly currency: CurrencyCode,
  ) {}

  /** Construct from an integer cents value. Rejects non-integral `number` inputs (no float). */
  static of(amountCents: bigint | number | string, currency: CurrencyCode): Money {
    let cents: bigint;
    if (typeof amountCents === 'bigint') {
      cents = amountCents;
    } else if (typeof amountCents === 'number') {
      if (!Number.isInteger(amountCents)) {
        throw new TypeError(`Money requires integer cents, got non-integer: ${amountCents}`);
      }
      cents = BigInt(amountCents);
    } else {
      // string — must be an integer literal
      if (!/^-?\d+$/.test(amountCents)) {
        throw new TypeError(`Money requires an integer-cents string, got: ${amountCents}`);
      }
      cents = BigInt(amountCents);
    }
    return new Money(cents, normalizeCurrency(currency));
  }

  static zero(currency: CurrencyCode): Money {
    return new Money(0n, normalizeCurrency(currency));
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new CurrencyMismatchError(this.currency, other.currency);
    }
  }

  plus(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.amountCents + other.amountCents, this.currency);
  }

  minus(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.amountCents - other.amountCents, this.currency);
  }

  /** Scale by an integer factor (e.g. quantity). Non-integer factors are rejected (no float). */
  times(factor: bigint | number): Money {
    let f: bigint;
    if (typeof factor === 'bigint') {
      f = factor;
    } else {
      if (!Number.isInteger(factor)) {
        throw new TypeError(`Money.times requires an integer factor, got: ${factor}`);
      }
      f = BigInt(factor);
    }
    return new Money(this.amountCents * f, this.currency);
  }

  negate(): Money {
    return new Money(-this.amountCents, this.currency);
  }

  isZero(): boolean {
    return this.amountCents === 0n;
  }

  isNegative(): boolean {
    return this.amountCents < 0n;
  }

  isPositive(): boolean {
    return this.amountCents > 0n;
  }

  equals(other: Money): boolean {
    return this.currency === other.currency && this.amountCents === other.amountCents;
  }

  /** Returns -1, 0, or 1. Throws on currency mismatch (ordering across currencies is undefined). */
  compareTo(other: Money): number {
    this.assertSameCurrency(other);
    if (this.amountCents < other.amountCents) return -1;
    if (this.amountCents > other.amountCents) return 1;
    return 0;
  }

  lessThan(other: Money): boolean {
    return this.compareTo(other) < 0;
  }

  lessThanOrEqual(other: Money): boolean {
    return this.compareTo(other) <= 0;
  }

  greaterThan(other: Money): boolean {
    return this.compareTo(other) > 0;
  }

  greaterThanOrEqual(other: Money): boolean {
    return this.compareTo(other) >= 0;
  }

  /** Wire/DB representation: cents serialized as a base-10 string (BigInt scalar contract). */
  toCentsString(): string {
    return this.amountCents.toString();
  }

  toString(): string {
    return `${this.amountCents.toString()} ${this.currency}`;
  }
}
