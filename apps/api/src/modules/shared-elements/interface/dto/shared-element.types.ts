/**
 * GraphQL object types for US5 (T086). Mirror the curated contract: goals, debts/credit cards with
 * per-member responsibilities, investments, and period-scoped budgets. Money is the shared
 * 64-bit-cents type; `remaining` is derived (limit − spent).
 */
import { Field, ID, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import { GraphQLDateTime } from 'graphql-scalars';
import { SharedDebtKind } from '@prisma/client';
import { MoneyType } from '../../../../common/graphql/money.type';
import { MembershipType } from '../../../profiles/interface/dto/profile.types';

registerEnumType(SharedDebtKind, { name: 'SharedDebtKind' });

@ObjectType('SharedGoal')
export class SharedGoalType {
  @Field(() => ID) id!: string;
  @Field() name!: string;
  @Field(() => MoneyType) targetAmount!: MoneyType;
  @Field(() => MoneyType) fundedAmount!: MoneyType;
  @Field(() => Int) version!: number;
}

@ObjectType('DebtResponsibility')
export class DebtResponsibilityType {
  @Field(() => ID) id!: string;
  @Field(() => MembershipType) membership!: MembershipType;
  @Field(() => Int) percentageBp!: number;
}

@ObjectType('SharedDebt')
export class SharedDebtType {
  @Field(() => ID) id!: string;
  @Field(() => SharedDebtKind) kind!: SharedDebtKind;
  @Field() name!: string;
  @Field(() => MoneyType) outstandingBalance!: MoneyType;
  @Field(() => [DebtResponsibilityType]) responsibilities!: DebtResponsibilityType[];
  @Field(() => Int) version!: number;
}

@ObjectType('SharedInvestment')
export class SharedInvestmentType {
  @Field(() => ID) id!: string;
  @Field() name!: string;
  @Field(() => MoneyType) currentValue!: MoneyType;
  @Field(() => GraphQLDateTime) valueAsOf!: Date;
  @Field(() => Int) version!: number;
}

@ObjectType('SharedBudget')
export class SharedBudgetType {
  @Field(() => ID) id!: string;
  @Field() category!: string;
  @Field(() => MoneyType) limit!: MoneyType;
  @Field(() => MoneyType) spent!: MoneyType;
  @Field(() => MoneyType) remaining!: MoneyType;
  @Field(() => ID) periodId!: string;
  @Field(() => Int) version!: number;
}
