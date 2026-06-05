/**
 * Lightweight Result type for domain command handlers (R10). Domain logic never throws for
 * expected business failures — it returns `err(DomainError)`. Unexpected/programming errors
 * still throw. The interface layer unwraps Results and maps errors via graphql-error.mapper.ts.
 */
import { DomainError } from './domain-error';

export type Result<T> = Ok<T> | Err;

export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

export interface Err {
  readonly ok: false;
  readonly error: DomainError;
}

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err(error: DomainError): Err {
  return { ok: false, error };
}

export function isOk<T>(result: Result<T>): result is Ok<T> {
  return result.ok;
}

export function isErr<T>(result: Result<T>): result is Err {
  return !result.ok;
}

/** Unwrap or throw the underlying DomainError (used at the interface boundary). */
export function unwrap<T>(result: Result<T>): T {
  if (result.ok) {
    return result.value;
  }
  throw result.error;
}
