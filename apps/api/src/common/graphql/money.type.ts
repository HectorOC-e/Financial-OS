import { Field, ObjectType } from '@nestjs/graphql';
import { GraphQLBigInt } from 'graphql-scalars';
import { Money } from '../money/money';

/**
 * GraphQL representation of money (T029). `amountCents` is a 64-bit integer serialized as a string
 * via the BigInt scalar; `currency` is an ISO 4217 code. Mirrors the domain `Money` value object.
 */
@ObjectType('Money')
export class MoneyType {
  @Field(() => GraphQLBigInt, { description: 'Integer minor units (cents) as a 64-bit value.' })
  amountCents!: bigint;

  @Field(() => String, { description: 'ISO 4217 currency code.' })
  currency!: string;

  static fromDomain(money: Money): MoneyType {
    const dto = new MoneyType();
    dto.amountCents = money.amountCents;
    dto.currency = money.currency;
    return dto;
  }

  static fromCents(amountCents: bigint, currency: string): MoneyType {
    return MoneyType.fromDomain(Money.of(amountCents, currency));
  }
}
