/**
 * GraphQL input types for US2/US3 mutations (T053/T061). Shape validation only; the cap, range, and
 * positivity rules are authoritative server-side (Principle VIII).
 */
import { Field, ID, InputType, Int } from '@nestjs/graphql';
import { GraphQLBigInt } from 'graphql-scalars';
import { Max, Min } from 'class-validator';

@InputType()
export class SetDeclaredIncomeInput {
  @Field(() => ID) sharedProfileId!: string;
  @Field(() => ID) membershipId!: string;
  @Field(() => GraphQLBigInt) amountCents!: bigint;
}

@InputType()
export class SetAllocationInput {
  @Field(() => ID) sharedProfileId!: string;
  @Field(() => ID) membershipId!: string;

  @Field(() => Int)
  @Min(0)
  @Max(10000)
  percentageBp!: number;
}

@InputType()
export class RecordContributionInput {
  @Field(() => ID) sharedProfileId!: string;
  @Field(() => ID) membershipId!: string;
  @Field(() => GraphQLBigInt) amountCents!: bigint;
  @Field(() => ID, { nullable: true }) sourceAccountId?: string | null;
}
