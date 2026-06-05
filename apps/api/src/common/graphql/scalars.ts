/**
 * Canonical custom scalars used across the schema (T029). One source so every resolver references
 * the same implementations and the emitted SDL is stable (Principle XI).
 *
 *  - BigInt   — 64-bit money minor units, string-serialized (analysis I1 / FR-024). See bigint.scalar.ts.
 *  - UUID     — RFC 4122 identifiers.
 *  - DateTime — ISO-8601 timestamps.
 */
import { GraphQLUUID, GraphQLDateTime } from 'graphql-scalars';
export { BigIntScalar } from './bigint.scalar';

export const UUIDScalar = GraphQLUUID;
export const DateTimeScalar = GraphQLDateTime;
