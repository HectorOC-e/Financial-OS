/**
 * GraphQL inputs for US6 personal-account mutations (T095). Shape validation only; balances and the
 * contribution flow are validated authoritatively server-side.
 */
import { Field, ID, InputType } from '@nestjs/graphql';
import { GraphQLBigInt } from 'graphql-scalars';
import { AccountType } from '@prisma/client';
import { IsNotEmpty, Length, Matches } from 'class-validator';

@InputType()
export class CreatePersonalAccountInput {
  @Field(() => AccountType) type!: AccountType;

  @Field()
  @IsNotEmpty()
  @Length(1, 120)
  name!: string;

  @Field()
  @Matches(/^[A-Za-z]{3}$/, { message: 'currency must be an ISO 4217 alpha-3 code' })
  currency!: string;

  @Field(() => GraphQLBigInt) openingBalanceCents!: bigint;
}

@InputType()
export class ContributeFromAccountInput {
  @Field(() => ID) accountId!: string;
  @Field(() => ID) sharedProfileId!: string;
  @Field(() => ID) membershipId!: string;
  @Field(() => GraphQLBigInt) amountCents!: bigint;
}
