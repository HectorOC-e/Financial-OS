import { GraphQLBigInt } from 'graphql-scalars';

/**
 * 64-bit money scalar (FR-024 / analysis I1). Money minor units (cents) are represented as
 * 64-bit integers end-to-end and serialized as strings over the wire to avoid the 32-bit
 * GraphQL `Int` overflow and JS number precision loss. Re-exported here as the single
 * project-wide `BigInt` scalar so resolvers reference one canonical implementation.
 */
export const BigIntScalar = GraphQLBigInt;
