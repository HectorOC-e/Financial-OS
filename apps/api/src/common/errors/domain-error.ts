/**
 * Domain error taxonomy (Principle IV). Domain command handlers return typed `Result`s
 * carrying a `DomainError`; the interface layer maps these to GraphQL errors (see
 * graphql-error.mapper.ts). The full catalog with descriptions lives in
 * `common/errors/catalog.ts` (Phase 10 / T108); these are the codes Phase 2+ depends on.
 */

export enum DomainErrorCode {
  /** Optimistic-concurrency mismatch — stale `expectedVersion` (FR-006a). */
  CONFLICT = 'CONFLICT',
  /** Caller's role lacks the capability for the attempted action (FR-006). */
  FORBIDDEN = 'FORBIDDEN',
  /** Referenced aggregate does not exist (or is not visible to this tenant/principal). */
  NOT_FOUND = 'NOT_FOUND',
  /** Input failed business validation (shape validation happens at the GraphQL boundary). */
  VALIDATION = 'VALIDATION',
  /** A domain invariant would be violated (e.g. two owners, status machine). */
  INVARIANT = 'INVARIANT',
  /** Arithmetic attempted across differing currencies. */
  CURRENCY_MISMATCH = 'CURRENCY_MISMATCH',
  /** Payment exceeds outstanding balance (FR-020b). */
  OVERPAYMENT = 'OVERPAYMENT',
  /** Cross-profile committed percentage would exceed 100% (FR-015a). */
  CAP_EXCEEDED = 'CAP_EXCEEDED',
  /** Write attempted against an archived (read-only) profile (FR-007c). */
  ARCHIVED = 'ARCHIVED',
}

export class DomainError extends Error {
  constructor(
    readonly code: DomainErrorCode,
    message: string,
    /** Optional structured context surfaced in the GraphQL error `extensions`. */
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'DomainError';
  }

  static conflict(message = 'The record was modified by another operation', details?: Record<string, unknown>): DomainError {
    return new DomainError(DomainErrorCode.CONFLICT, message, details);
  }

  static forbidden(message = 'You do not have permission to perform this action', details?: Record<string, unknown>): DomainError {
    return new DomainError(DomainErrorCode.FORBIDDEN, message, details);
  }

  static notFound(message = 'Not found', details?: Record<string, unknown>): DomainError {
    return new DomainError(DomainErrorCode.NOT_FOUND, message, details);
  }

  static validation(message: string, details?: Record<string, unknown>): DomainError {
    return new DomainError(DomainErrorCode.VALIDATION, message, details);
  }

  static invariant(message: string, details?: Record<string, unknown>): DomainError {
    return new DomainError(DomainErrorCode.INVARIANT, message, details);
  }

  static capExceeded(message: string, details?: Record<string, unknown>): DomainError {
    return new DomainError(DomainErrorCode.CAP_EXCEEDED, message, details);
  }

  static overpayment(message = 'Payment exceeds the outstanding balance', details?: Record<string, unknown>): DomainError {
    return new DomainError(DomainErrorCode.OVERPAYMENT, message, details);
  }

  static archived(message = 'This profile is archived and read-only', details?: Record<string, unknown>): DomainError {
    return new DomainError(DomainErrorCode.ARCHIVED, message, details);
  }
}
