<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan:
`specs/001-shared-financial-profiles/plan.md`

**Active feature**: Shared Financial Profiles (`001-shared-financial-profiles`)
**Stack**: NestJS + GraphQL (code-first) + Prisma + PostgreSQL 16 + Redis 7 (backend);
Flutter 3 (mobile client); OpenRouter (read-only AI coaching).
**Architecture**: domain-first modular monolith; pure deterministic domain layers (64-bit integer-cents
money via `BigInt`, no floating point); transactional outbox → BullMQ events; BullMQ repeatable jobs for
period auto-rollover + 14-day invitation expiry; optimistic concurrency (`version`) on mutable shared
records; profile soft-archival (read-only); PostgreSQL RLS multi-tenancy; AI is read-only.
**Artifacts**: spec.md, plan.md, research.md, data-model.md, contracts/schema.graphql, contracts/events.md,
quickstart.md.
<!-- SPECKIT END -->

## Module map (implementation — Phases 1–10 complete)

Backend bounded contexts live in `apps/api/src/modules/` (see `apps/api/src/modules/README.md`
for the full map): `tenancy`, `permissions`, `events`, `scheduling`, `profiles`, `accounts`,
`contributions`, `shared-elements`, `ai-coaching`. Cross-cutting code in `apps/api/src/common/`:
`money` (integer-cents + largest-remainder allocator), `errors` (taxonomy + catalog), `graphql`
(BigInt scalar, cursor pagination), `persistence` (optimistic concurrency), `cache`, `throttling`
(rate limits), `observability` (OTel), `config` (env + PII/data-protection posture), `pubsub`.
The Flutter client is `apps/mobile/` (no business logic); the GraphQL contract source of truth is
`packages/contracts/schema.graphql`.

## Commands (pnpm only — never npm)

- `pnpm test` (all suites) · `pnpm test:unit` · `pnpm test:contract` · `pnpm test:integration`
- Integration/contract suites need `docker compose up -d postgres redis`; the unit suite is pure.
- `pnpm api:dev` runs the API; `pnpm lint` lints all workspaces.
