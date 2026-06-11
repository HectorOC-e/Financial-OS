/**
 * Contract/schema validity for US5 (T091). Builds the SDL from the profile + contribution +
 * shared-element resolvers and asserts the shared-element operations and types match the curated
 * contract. Metadata-only — no database.
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
import { SharedElementsResolver } from '../../src/modules/shared-elements/interface/shared-elements.resolver';

describe('GraphQL contract — US5 shared-element operations (T091)', () => {
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
      SharedElementsResolver,
    ]);
    sdl = printSchema(schema);
    await app.close();
  });

  const mutations = [
    'createSharedGoal',
    'fundGoal',
    'createSharedDebt',
    'paySharedDebt',
    'setDebtResponsibility',
    'createSharedInvestment',
    'updateInvestmentValue',
    'createSharedBudget',
    'recordBudgetSpend',
  ];

  it.each(mutations)('emits mutation %s and the contract declares it', (name) => {
    expect(sdl).toContain(`${name}(`);
    expect(contract).toContain(`${name}(`);
  });

  it('emits the shared-element object types', () => {
    for (const t of ['type SharedGoal', 'type SharedDebt', 'type DebtResponsibility', 'type SharedInvestment', 'type SharedBudget']) {
      expect(sdl).toContain(t);
      expect(contract).toContain(t);
    }
  });

  it('exposes period-scoped budgets with a derived remaining (FR-018/I2)', () => {
    // Code-first emits the built-in ID scalar (the curated contract uses the UUID alias).
    expect(sdl).toMatch(/type SharedBudget[^}]*remaining: Money!/s);
    expect(sdl).toMatch(/type SharedBudget[^}]*periodId: ID!/s);
    expect(contract).toMatch(/type SharedBudget[^}]*periodId: UUID!/s);
  });

  it('emits the SharedDebtKind enum and expectedVersion-guarded inputs (FR-006a)', () => {
    expect(sdl).toMatch(/enum SharedDebtKind/);
    expect(sdl).toMatch(/input PaySharedDebtInput[^}]*expectedVersion: Int!/s);
    expect(sdl).toMatch(/input FundGoalInput[^}]*expectedVersion: Int!/s);
  });
});
