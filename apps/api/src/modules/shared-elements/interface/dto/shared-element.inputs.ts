/**
 * GraphQL input types for US5 mutations (T086). Carry `expectedVersion` on mutable records for
 * optimistic concurrency (FR-006a); business validation is authoritative server-side.
 */
import { Field, ID, InputType, Int } from '@nestjs/graphql';
import { GraphQLBigInt } from 'graphql-scalars';
import { Max, Min } from 'class-validator';

@InputType()
export class FundGoalInput {
  @Field(() => ID) sharedGoalId!: string;
  @Field(() => GraphQLBigInt) amountCents!: bigint;
  @Field(() => Int) expectedVersion!: number;
}

@InputType()
export class PaySharedDebtInput {
  @Field(() => ID) sharedDebtId!: string;
  @Field(() => GraphQLBigInt) amountCents!: bigint;
  @Field(() => Int) expectedVersion!: number;
}

@InputType()
export class SetDebtResponsibilityInput {
  @Field(() => ID) sharedDebtId!: string;
  @Field(() => ID) membershipId!: string;

  @Field(() => Int)
  @Min(0)
  @Max(10000)
  percentageBp!: number;

  @Field(() => Int) expectedVersion!: number;
}
