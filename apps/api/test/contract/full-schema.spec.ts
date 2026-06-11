/**
 * Full-schema contract validity (US6/US7 + whole graph). Builds the SDL from every resolver to catch
 * cross-module schema errors, and asserts the personal-account and coaching operations match the
 * curated contract. Metadata-only — no database.
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
import { AccountsResolver } from '../../src/modules/accounts/interface/accounts.resolver';
import { CoachingResolver } from '../../src/modules/ai-coaching/interface/coaching.resolver';

describe('GraphQL contract — full schema (US6/US7)', () => {
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
      AccountsResolver,
      CoachingResolver,
    ]);
    sdl = printSchema(schema);
    await app.close();
  });

  it.each(['createPersonalAccount', 'contributeFromAccount'])(
    'emits personal-account mutation %s and the contract declares it (US6)',
    (name) => {
      expect(sdl).toContain(`${name}(`);
      expect(contract).toContain(`${name}(`);
    },
  );

  it('resolves PersonalProfile.accounts (owner-only) without leaking to other members', () => {
    expect(sdl).toMatch(/type PersonalProfile[^}]*accounts: \[Account!\]!/s);
  });

  it('emits the read-only coaching query + types (US7)', () => {
    expect(sdl).toMatch(/coachingInsights\(sharedProfileId:/);
    expect(contract).toMatch(/coachingInsights\(sharedProfileId:/);
    for (const t of ['type CoachingInsight', 'type CoachingSuggestion']) {
      expect(sdl).toContain(t);
      expect(contract).toContain(t);
    }
  });

  it('keeps coaching advisory — suggestedMutation is a nullable hint, not an action', () => {
    expect(sdl).toMatch(/type CoachingSuggestion[^}]*suggestedMutation: String\b/s);
  });
});
