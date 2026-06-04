# @financial-os/contracts

Canonical contract artifacts shared across the API and the Flutter client.

- `schema.graphql` — the GraphQL schema. The NestJS API (code-first) **emits** this file via
  `autoSchemaFile` (see `apps/api/src/app.module.ts`); a contract test asserts the emitted SDL matches
  the committed file. The mobile client runs codegen against it.
- `events.md` — the versioned domain-event catalog (transactional outbox → BullMQ).

The authoritative design copies live under
`specs/001-shared-financial-profiles/contracts/`; this package is the runtime-referenced copy.
At Phase 1 the schema is seeded from the spec; from Phase 2 it is emitted by the API build.
