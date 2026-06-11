/**
 * GraphQL contract test (T046). Builds the SDL from the code-first US1 resolver metadata and asserts
 * the emitted operations and types match the curated contract in packages/contracts/schema.graphql.
 * No database or network required — schema generation is metadata-only.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { GraphQLSchemaBuilderModule, GraphQLSchemaFactory } from '@nestjs/graphql';
import { printSchema, GraphQLSchema } from 'graphql';
import { ProfilesResolver } from '../../src/modules/profiles/interface/profiles.resolver';

describe('GraphQL contract — US1 operations (T046)', () => {
  let sdl: string;
  const contract = readFileSync(
    join(__dirname, '../../../../packages/contracts/schema.graphql'),
    'utf8',
  );

  beforeAll(async () => {
    const app = await NestFactory.create(GraphQLSchemaBuilderModule, { logger: false });
    await app.init();
    const factory = app.get(GraphQLSchemaFactory);
    const schema: GraphQLSchema = await factory.create([ProfilesResolver]);
    sdl = printSchema(schema);
    await app.close();
  });

  const mutations = [
    'createSharedProfile',
    'inviteMember',
    'acceptInvitation',
    'declineInvitation',
    'changeMemberRole',
    'leaveProfile',
    'nominateOwner',
    'acceptOwnership',
    'archiveProfile',
  ];
  const queries = ['me', 'sharedProfile', 'myMemberships'];

  it.each(mutations)('emits mutation %s and the contract declares it', (name) => {
    expect(sdl).toContain(`${name}(`);
    expect(contract).toContain(`${name}(`);
  });

  it.each(queries)('emits query %s and the contract declares it', (name) => {
    expect(sdl).toMatch(new RegExp(`\\b${name}\\b`));
    expect(contract).toMatch(new RegExp(`\\b${name}\\b`));
  });

  it('emits the core US1 object types', () => {
    for (const t of ['type SharedProfile', 'type Membership', 'type User', 'type PersonalProfile']) {
      expect(sdl).toContain(t);
      expect(contract).toContain(t);
    }
  });

  it('emits the full membership status enum (FR-002a)', () => {
    expect(sdl).toMatch(/enum MembershipStatusEnum/);
    for (const v of ['INVITED', 'ACTIVE', 'DECLINED', 'EXPIRED', 'LEFT']) {
      expect(sdl).toContain(v);
    }
  });

  it('changeMemberRole carries expectedVersion for optimistic concurrency (FR-006a)', () => {
    expect(sdl).toMatch(/changeMemberRole\([^)]*expectedVersion/s);
  });
});
