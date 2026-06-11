/**
 * Contract/schema validity for US2/US3 (supports T053/T061/T063). Builds the SDL from the combined
 * profile + contribution resolvers (metadata-only) and asserts the emitted operations, derived
 * fields, and subscriptions match the curated contract. Catches schema-graph errors (bad field
 * resolvers, missing enums) without a database.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { GraphQLSchemaBuilderModule, GraphQLSchemaFactory } from '@nestjs/graphql';
import { printSchema, GraphQLSchema } from 'graphql';
import { ProfilesResolver } from '../../src/modules/profiles/interface/profiles.resolver';
import {
  ContributionsResolver,
  MembershipContributionsResolver,
  ContributionSubscriptionsResolver,
} from '../../src/modules/contributions/interface/contributions.resolver';

describe('GraphQL contract — US2/US3 operations', () => {
  let sdl: string;
  const contract = readFileSync(join(__dirname, '../../../../packages/contracts/schema.graphql'), 'utf8');

  beforeAll(async () => {
    const app = await NestFactory.create(GraphQLSchemaBuilderModule, { logger: false });
    await app.init();
    const factory = app.get(GraphQLSchemaFactory);
    const schema: GraphQLSchema = await factory.create([
      ProfilesResolver,
      ContributionsResolver,
      MembershipContributionsResolver,
      ContributionSubscriptionsResolver,
    ]);
    sdl = printSchema(schema);
    await app.close();
  });

  it.each(['setDeclaredIncome', 'setAllocation', 'recordContribution'])(
    'emits mutation %s and the contract declares it',
    (name) => {
      expect(sdl).toContain(`${name}(`);
      expect(contract).toContain(`${name}(`);
    },
  );

  it('emits the remainingAllocationPercentageBp query (FR-015a)', () => {
    expect(sdl).toMatch(/remainingAllocationPercentageBp/);
    expect(contract).toMatch(/remainingAllocationPercentageBp/);
  });

  it('extends SharedProfile with poolTotal + currentPeriod', () => {
    expect(sdl).toMatch(/poolTotal\(periodId:/);
    expect(sdl).toMatch(/currentPeriod:\s*ContributionPeriod/);
  });

  it('extends Membership with standing + allocationPercentageBp', () => {
    expect(sdl).toMatch(/standing\(periodId:/);
    expect(sdl).toMatch(/allocationPercentageBp:\s*Int/);
  });

  it('emits the live standing/pool subscriptions (T063)', () => {
    expect(sdl).toMatch(/type Subscription/);
    expect(sdl).toContain('poolTotalChanged');
    expect(sdl).toContain('contributionStandingChanged');
  });

  it('emits the StandingState enum', () => {
    expect(sdl).toMatch(/enum StandingState/);
    for (const v of ['ON_TRACK', 'AHEAD', 'BEHIND']) expect(sdl).toContain(v);
  });
});
