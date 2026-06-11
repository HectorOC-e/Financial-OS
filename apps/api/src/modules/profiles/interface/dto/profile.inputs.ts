/**
 * GraphQL input types for US1 mutations (T038). Shape validation lives here (class-validator);
 * business validation is authoritative in the domain/application layer (Principle VIII).
 */
import { Field, ID, InputType } from '@nestjs/graphql';
import { MemberRole, PeriodLength } from '@prisma/client';
import { IsIn, IsNotEmpty, Length, Matches } from 'class-validator';

@InputType()
export class CreateSharedProfileInput {
  @Field()
  @IsNotEmpty()
  @Length(1, 120)
  name!: string;

  @Field()
  @Matches(/^[A-Za-z]{3}$/, { message: 'baseCurrency must be an ISO 4217 alpha-3 code' })
  baseCurrency!: string;

  @Field(() => PeriodLength, { defaultValue: PeriodLength.MONTHLY })
  periodLength!: PeriodLength;
}

@InputType()
export class InviteMemberInput {
  @Field(() => ID) sharedProfileId!: string;
  @Field(() => ID) userId!: string;

  @Field(() => MemberRole)
  @IsIn([MemberRole.ADMIN, MemberRole.CONTRIBUTOR, MemberRole.VIEWER], {
    message: 'OWNER cannot be assigned by invitation (use ownership transfer)',
  })
  role!: MemberRole;
}

@InputType()
export class NominateOwnerInput {
  @Field(() => ID) sharedProfileId!: string;
  @Field(() => ID) nomineeMembershipId!: string;
}
