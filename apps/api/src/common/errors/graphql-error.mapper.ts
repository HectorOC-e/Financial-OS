/**
 * Maps domain errors to GraphQL errors with a stable machine-readable `extensions.code`
 * (Principle XI — versioned, agent-discoverable contract). Unknown/unexpected errors map to
 * INTERNAL_SERVER_ERROR without leaking internals.
 */
import { GraphQLError } from 'graphql';
import { DomainError, DomainErrorCode } from './domain-error';

export function toGraphQLError(error: unknown): GraphQLError {
  if (error instanceof DomainError) {
    return new GraphQLError(error.message, {
      extensions: {
        code: error.code,
        ...(error.details ? { details: error.details } : {}),
      },
    });
  }

  if (error instanceof GraphQLError) {
    return error;
  }

  const message = error instanceof Error ? error.message : 'Internal server error';
  return new GraphQLError('Internal server error', {
    extensions: { code: 'INTERNAL_SERVER_ERROR' },
    originalError: error instanceof Error ? error : new Error(message),
  });
}

/** Convenience guard for resolvers that unwrap Results. */
export function isDomainErrorCode(error: unknown, code: DomainErrorCode): boolean {
  return error instanceof DomainError && error.code === code;
}
