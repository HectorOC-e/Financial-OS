/**
 * SDL ↔ contract conformance (T114). Builds the full code-first schema from every resolver and
 * verifies it implements the curated contract in packages/contracts/schema.graphql completely:
 * every operation (Query/Mutation/Subscription field), every object type, every enum, and the
 * pagination arguments added by T107. Metadata-only — no database.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { GraphQLSchemaBuilderModule, GraphQLSchemaFactory } from '@nestjs/graphql';
import { GraphQLObjectType, GraphQLSchema, printSchema } from 'graphql';
import { ProfilesResolver } from '../../src/modules/profiles/interface/profiles.resolver';
import {
  ContributionsResolver,
  MembershipContributionsResolver,
  ContributionSubscriptionsResolver,
} from '../../src/modules/contributions/interface/contributions.resolver';
import { SharedElementsResolver } from '../../src/modules/shared-elements/interface/shared-elements.resolver';
import { AccountsResolver } from '../../src/modules/accounts/interface/accounts.resolver';
import { CoachingResolver } from '../../src/modules/ai-coaching/interface/coaching.resolver';

/** Top-level field names declared in a contract block like `type Query { ... }`. */
function contractFields(contract: string, blockName: string): string[] {
  const block = contract.match(new RegExp(`type ${blockName} \\{([\\s\\S]*?)\\n\\}`, 'm'));
  if (!block) return [];
  return [...block[1].matchAll(/^\s{2}([a-zA-Z][a-zA-Z0-9]*)\s*[(:]/gm)].map((m) => m[1]);
}

/** All `type X`/`enum X` names declared in the curated contract. */
function contractTypeNames(contract: string, kind: 'type' | 'enum'): string[] {
  return [...contract.matchAll(new RegExp(`^${kind} ([A-Za-z0-9]+)`, 'gm'))]
    .map((m) => m[1])
    .filter((n) => !['Query', 'Mutation', 'Subscription'].includes(n));
}

describe('GraphQL contract — SDL export conformance (T114)', () => {
  let schema: GraphQLSchema;
  let sdl: string;
  const contract = readFileSync(join(__dirname, '../../../../packages/contracts/schema.graphql'), 'utf8');

  beforeAll(async () => {
    const app = await NestFactory.create(GraphQLSchemaBuilderModule, { logger: false });
    await app.init();
    const factory = app.get(GraphQLSchemaFactory);
    schema = await factory.create([
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

  it.each(['Query', 'Mutation', 'Subscription'] as const)(
    'implements every contract %s operation',
    (blockName) => {
      const declared = contractFields(contract, blockName);
      expect(declared.length).toBeGreaterThan(0);
      const root =
        blockName === 'Query'
          ? schema.getQueryType()
          : blockName === 'Mutation'
            ? schema.getMutationType()
            : schema.getSubscriptionType();
      const emitted = Object.keys(root?.getFields() ?? {});
      for (const field of declared) {
        expect(emitted).toContain(field);
      }
    },
  );

  it('emits every contract object type', () => {
    for (const name of contractTypeNames(contract, 'type')) {
      expect(sdl).toContain(`type ${name}`);
    }
  });

  it('emits every contract enum', () => {
    for (const name of contractTypeNames(contract, 'enum')) {
      expect(sdl).toContain(`enum ${name}`);
    }
  });

  it('cursor-paginates the unbounded SharedProfile lists (T107/CHK017)', () => {
    const sharedProfile = schema.getType('SharedProfile') as GraphQLObjectType;
    const fields = sharedProfile.getFields();
    for (const fieldName of ['members', 'contributionRecords', 'sharedGoals']) {
      const argNames = fields[fieldName].args.map((a) => a.name);
      expect(argNames).toEqual(expect.arrayContaining(['first', 'after']));
    }
  });

  it('money stays 64-bit: Money.amountCents is BigInt in both contract and SDL', () => {
    expect(contract).toMatch(/type Money \{ amountCents: BigInt!/);
    expect(sdl).toMatch(/type Money \{[^}]*amountCents: BigInt!/s);
  });
});
