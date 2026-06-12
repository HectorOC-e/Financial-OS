/**
 * Error catalog (T108 — design-gate CHK016).
 *
 * The single, documented taxonomy of every error a client (Flutter, automation agents — Principle XI)
 * can receive from the GraphQL API. Two layers:
 *
 *  1. **Domain errors** (`DomainErrorCode`, common/errors/domain-error.ts) — produced by domain/
 *     application code as typed `Result` failures and surfaced with a stable `extensions.code`.
 *  2. **Transport errors** (`TransportErrorCode`) — produced at the GraphQL boundary before any
 *     domain code runs (authentication, rate limiting, validation of the document itself).
 *
 * Clients must branch on `extensions.code` only — messages are human-readable and may change.
 */
import { DomainErrorCode } from './domain-error';

/** Errors raised at the GraphQL boundary, outside the domain layer. */
export enum TransportErrorCode {
  /** No authenticated principal on the request. */
  UNAUTHENTICATED = 'UNAUTHENTICATED',
  /** Caller exceeded the mutation/AI rate limit (T109); retry after the window resets. */
  RATE_LIMITED = 'RATE_LIMITED',
  /** Document/variable shape rejected by GraphQL validation. */
  BAD_USER_INPUT = 'BAD_USER_INPUT',
  /** Unexpected server failure; internals are never leaked (graphql-error.mapper.ts). */
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
}

export interface ErrorCatalogEntry {
  code: DomainErrorCode | TransportErrorCode;
  /** HTTP-status analogue, for clients mapping GraphQL errors onto familiar semantics. */
  httpAnalogue: number;
  /** Whether an identical retry can succeed without the client changing anything. */
  retryable: boolean;
  /** When the server emits this code. */
  when: string;
  /** What a well-behaved client should do. */
  clientAction: string;
}

/**
 * The authoritative catalog. Every code emitted anywhere in the API MUST have an entry here;
 * the catalog unit/contract tests enforce completeness against `DomainErrorCode`.
 */
export const ERROR_CATALOG: readonly ErrorCatalogEntry[] = [
  // --- domain errors (Result failures mapped by graphql-error.mapper.ts) -------------------------
  {
    code: DomainErrorCode.CONFLICT,
    httpAnalogue: 409,
    retryable: true,
    when: 'Optimistic-concurrency mismatch: the supplied expectedVersion is stale (FR-006a).',
    clientAction: 'Refetch the record, surface the current state to the user, retry with the fresh version.',
  },
  {
    code: DomainErrorCode.FORBIDDEN,
    httpAnalogue: 403,
    retryable: false,
    when: "The caller's role lacks the capability for the attempted action (FR-006).",
    clientAction: 'Hide/disable the action for this role; do not retry.',
  },
  {
    code: DomainErrorCode.NOT_FOUND,
    httpAnalogue: 404,
    retryable: false,
    when: 'The aggregate does not exist or is not visible to this tenant/principal (existence is not leaked).',
    clientAction: 'Treat as missing; refresh any list the id came from.',
  },
  {
    code: DomainErrorCode.VALIDATION,
    httpAnalogue: 422,
    retryable: false,
    when: 'Input failed business validation (e.g. non-positive amount, empty name).',
    clientAction: 'Fix the input per `extensions.details` and resubmit.',
  },
  {
    code: DomainErrorCode.INVARIANT,
    httpAnalogue: 422,
    retryable: false,
    when: 'A domain invariant would be violated (two owners, illegal status transition, responsibilities ≠ 100%).',
    clientAction: 'Reload state; the attempted transition is not legal from the current state.',
  },
  {
    code: DomainErrorCode.CURRENCY_MISMATCH,
    httpAnalogue: 422,
    retryable: false,
    when: "Money in a different currency than the profile's single base currency entered a financial path (CHK041/T111).",
    clientAction: 'Only offer accounts/amounts in the profile base currency.',
  },
  {
    code: DomainErrorCode.OVERPAYMENT,
    httpAnalogue: 422,
    retryable: false,
    when: 'A debt payment exceeds the outstanding balance (FR-020b).',
    clientAction: 'Cap the payable amount at the outstanding balance shown in `extensions.details`.',
  },
  {
    code: DomainErrorCode.CAP_EXCEEDED,
    httpAnalogue: 422,
    retryable: false,
    when: 'The cross-profile committed percentage would exceed 100% (FR-015a).',
    clientAction: 'Query remainingAllocationPercentageBp and constrain the input.',
  },
  {
    code: DomainErrorCode.ARCHIVED,
    httpAnalogue: 409,
    retryable: false,
    when: 'A write was attempted against an archived (read-only) profile (FR-007c).',
    clientAction: 'Render the profile read-only; no mutation will succeed.',
  },
  // --- transport errors ---------------------------------------------------------------------------
  {
    code: TransportErrorCode.UNAUTHENTICATED,
    httpAnalogue: 401,
    retryable: false,
    when: 'No authenticated principal on the request.',
    clientAction: 'Re-authenticate, then retry.',
  },
  {
    code: TransportErrorCode.RATE_LIMITED,
    httpAnalogue: 429,
    retryable: true,
    when: 'The per-principal mutation or AI-coaching rate limit was exceeded (T109).',
    clientAction: 'Back off and retry after `extensions.details.retryAfterSeconds`.',
  },
  {
    code: TransportErrorCode.BAD_USER_INPUT,
    httpAnalogue: 400,
    retryable: false,
    when: 'The GraphQL document or variables failed shape validation (scalars, required args).',
    clientAction: 'Fix the request; this is a client bug.',
  },
  {
    code: TransportErrorCode.INTERNAL_SERVER_ERROR,
    httpAnalogue: 500,
    retryable: true,
    when: 'An unexpected server failure; details are logged server-side and never leaked.',
    clientAction: 'Retry with backoff; report if persistent.',
  },
];

/** Lookup by code (e.g. for docs generation or client SDK mapping tables). */
export function catalogEntry(code: DomainErrorCode | TransportErrorCode): ErrorCatalogEntry | undefined {
  return ERROR_CATALOG.find((e) => e.code === code);
}
