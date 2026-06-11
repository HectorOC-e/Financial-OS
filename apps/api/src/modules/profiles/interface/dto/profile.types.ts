/**
 * GraphQL object types for US1 (T038). Code-first DTOs mirroring the curated contract
 * (packages/contracts/schema.graphql) for the profile-governance surface. Only US1 fields are
 * present; contribution/standing/account-management fields land with their stories (US2/US3/US6).
 *
 * Personal-account isolation (FR-004/T039) is structural here: `UserType.personalProfile` is
 * nullable and the resolver populates it ONLY for the authenticated caller — a member listed under
 * another profile carries `personalProfile = null`, so other members' accounts are unreachable.
 */
import { Field, ID, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import { GraphQLDateTime } from 'graphql-scalars';
import { AccountType as PrismaAccountType, MemberRole, MembershipStatus, PeriodLength, ProfileStatus, ProfileType } from '@prisma/client';
import { MoneyType } from '../../../../common/graphql/money.type';

registerEnumType(MemberRole, { name: 'MemberRole' });
registerEnumType(MembershipStatus, { name: 'MembershipStatusEnum' });
registerEnumType(ProfileStatus, { name: 'ProfileStatus' });
registerEnumType(PeriodLength, { name: 'PeriodLength' });
registerEnumType(ProfileType, { name: 'ProfileType' });
registerEnumType(PrismaAccountType, { name: 'AccountType' });

@ObjectType('Account')
export class AccountType {
  @Field(() => ID) id!: string;
  @Field(() => ProfileType) profileType!: ProfileType;
  @Field(() => PrismaAccountType) type!: PrismaAccountType;
  @Field() name!: string;
  @Field(() => MoneyType) balance!: MoneyType;
  @Field() currency!: string;
}

@ObjectType('PersonalProfile')
export class PersonalProfileType {
  @Field(() => ID) id!: string;
  @Field(() => [AccountType]) accounts!: AccountType[];
}

@ObjectType('User')
export class UserType {
  @Field(() => ID) id!: string;
  @Field() displayName!: string;
  /** Populated only for the authenticated caller (FR-004 isolation); null for other members. */
  @Field(() => PersonalProfileType, { nullable: true }) personalProfile?: PersonalProfileType | null;
}

@ObjectType('Membership')
export class MembershipType {
  @Field(() => ID) id!: string;
  @Field(() => UserType) user!: UserType;
  @Field(() => MemberRole) role!: MemberRole;
  @Field(() => MembershipStatus) status!: MembershipStatus;
  @Field(() => GraphQLDateTime, { nullable: true }) invitationExpiresAt?: Date | null;
  @Field(() => MoneyType, { nullable: true }) declaredIncome?: MoneyType | null;
  @Field(() => Int) version!: number;
}

@ObjectType('SharedProfile')
export class SharedProfileType {
  @Field(() => ID) id!: string;
  @Field() name!: string;
  @Field() baseCurrency!: string;
  @Field(() => PeriodLength) periodLength!: PeriodLength;
  @Field(() => ProfileStatus) status!: ProfileStatus;
  @Field(() => MembershipType, { nullable: true }) owner?: MembershipType | null;
  @Field(() => [MembershipType]) members!: MembershipType[];
}
