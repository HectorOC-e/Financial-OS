/**
 * GraphQL object types for US2/US3 (T053/T061). Mirror the curated contract: plans, allocations,
 * periods, records, and standings. Money is the shared 64-bit-cents type.
 */
import { Field, ID, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import { GraphQLDateTime } from 'graphql-scalars';
import { PeriodStatus } from '@prisma/client';
import { MoneyType } from '../../../../common/graphql/money.type';
import { MembershipType } from '../../../profiles/interface/dto/profile.types';

export enum StandingState {
  ON_TRACK = 'ON_TRACK',
  AHEAD = 'AHEAD',
  BEHIND = 'BEHIND',
}
registerEnumType(StandingState, { name: 'StandingState' });
registerEnumType(PeriodStatus, { name: 'PeriodStatus' });

@ObjectType('ContributionStanding')
export class ContributionStandingType {
  @Field(() => MoneyType) expected!: MoneyType;
  @Field(() => MoneyType) actual!: MoneyType;
  @Field(() => MoneyType) variance!: MoneyType;
  @Field(() => StandingState) state!: StandingState;
}

@ObjectType('ContributionPeriod')
export class ContributionPeriodType {
  @Field(() => ID) id!: string;
  @Field(() => GraphQLDateTime) startDate!: Date;
  @Field(() => GraphQLDateTime) endDate!: Date;
  @Field(() => PeriodStatus) status!: PeriodStatus;
}

@ObjectType('ContributionAllocation')
export class ContributionAllocationType {
  @Field(() => ID) id!: string;
  @Field(() => MembershipType) membership!: MembershipType;
  @Field(() => Int) percentageBp!: number;
}

@ObjectType('ContributionPlan')
export class ContributionPlanType {
  @Field(() => ID) id!: string;
  @Field(() => Int) version!: number;
  @Field(() => ID, { nullable: true }) effectiveFromPeriodId?: string | null;
  @Field(() => [ContributionAllocationType]) allocations!: ContributionAllocationType[];
}

@ObjectType('ContributionRecord')
export class ContributionRecordType {
  @Field(() => ID) id!: string;
  @Field(() => MembershipType) membership!: MembershipType;
  @Field(() => MoneyType) amount!: MoneyType;
  @Field(() => GraphQLDateTime) recordedAt!: Date;
}
