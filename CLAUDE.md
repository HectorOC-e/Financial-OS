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
