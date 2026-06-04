# Phase 0 Research: Shared Financial Profiles

All Technical Context items were supplied explicitly (Flutter, NestJS, GraphQL, Prisma, PostgreSQL,
OpenRouter) — no `NEEDS CLARIFICATION` remained. Research therefore focuses on best-practice decisions
for applying this stack to the constitution's principles (determinism, isolation, events, multi-tenancy,
AI boundary).

---

## R1. Money representation & deterministic calculations

- **Decision**: Represent all money as integer **minor units (cents)** in a `Money` value object
  (amount: bigint/integer + ISO currency code). Percentages as integer **basis points** (0–10000).
  All financial math lives in pure functions with explicit, documented rounding. Percentage-based splits
  use the **largest-remainder method**: floor each share, then distribute leftover minor units to the
  members with the largest fractional remainders, ties broken by stable membership ID order (spec FR-024a).
- **Rationale**: Constitution Principles II & VIII and Architectural Constraints prohibit floating point
  and require determinism + exact reconciliation (SC-005). Integer math guarantees identical results
  across backend, mobile, exports, and AI channels (Principle X).
- **Alternatives considered**: `decimal.js` (rejected — heavier, still needs discipline, and integers are
  simpler to test exhaustively); native `number`/float (rejected — non-deterministic accumulation, banned
  by constitution); Postgres `NUMERIC` only (kept for storage, but domain still computes in integers).

## R2. GraphQL approach (code-first vs schema-first)

- **Decision**: **Code-first** with `@nestjs/graphql` decorators; export the generated SDL into
  `packages/contracts/schema.graphql` as the versioned source of truth used for contract tests and the
  Flutter codegen.
- **Rationale**: Keeps resolver types and schema in sync, supports modular composition per bounded
  context, and still yields a checked-in SDL for Principle XI (versioned discoverable contract).
- **Alternatives considered**: Schema-first SDL (rejected — type drift between SDL and resolvers); REST
  (rejected — user explicitly chose GraphQL; subscriptions also useful for live contribution standing).

## R3. Multi-tenant isolation strategy

- **Decision**: **Shared database, shared schema** with a non-null `tenant_id` on every tenant-scoped
  table and **PostgreSQL Row-Level Security (RLS)** policies keyed off a per-request `app.tenant_id`
  session GUC set by a Prisma middleware/`$transaction` wrapper. A NestJS `TenancyModule` derives tenant
  from the authenticated principal and forbids cross-tenant access by default.
- **Rationale**: Principle IX (isolation enforced at storage + service layers, no cross-tenant leakage,
  onboarding without code changes). RLS gives defense-in-depth even if an application query forgets a
  filter.
- **Alternatives considered**: Schema-per-tenant (rejected — migration/ops overhead at 10k tenants);
  database-per-tenant (rejected — too costly for SaaS scale); app-only filtering (rejected — single
  forgotten `where` leaks data; violates "enforced at storage layer").

## R4. Event-driven architecture (reliable publishing)

- **Decision**: **Transactional outbox** — domain events are written to an `outbox` table in the same DB
  transaction as the state change; a dispatcher relays them to **BullMQ (Redis)** for async consumers.
  Event payloads carry `schemaVersion`, `tenantId`, `aggregateId`, `occurredAt`, and are append-only.
- **Rationale**: Principle VI (events publishable, versioned, replayable; consumers can re-subscribe).
  Outbox guarantees no event is lost or published without the state change committing (atomicity with the
  audit trail).
- **Alternatives considered**: Direct publish in resolver (rejected — dual-write inconsistency); Postgres
  LISTEN/NOTIFY only (rejected — not durable/replayable); Kafka (deferred — viable later; BullMQ/Redis is
  sufficient for current scale and already needed for caching).

## R5. Permission model & enforcement (RBAC)

- **Decision**: Four roles per shared profile — **Owner, Admin, Contributor, Viewer** (from spec FR-005).
  Enforcement at two layers: a NestJS `PermissionsGuard` resolving the caller's membership role + an
  action→role capability matrix, AND domain-level invariants (e.g., a command rejects if the actor role
  lacks capability). Every membership/permission change and financially significant mutation writes an
  immutable `AuditEntry`.
- **Rationale**: Principles V & VII (enforced server-side at domain layer, not just API/UI), FR-006/FR-007.
- **Alternatives considered**: UI-only gating (rejected — violates Principle VII); attribute-based access
  control (deferred — RBAC matrix is sufficient and clearer to test for this scope).

## R6. Cross-profile income allocation cap (FR-015a)

- **Decision**: Maintain a per-member, per-tenant **committed-percentage ledger** aggregated across all
  profiles the member belongs to; allocation/redistribution commands validate `sum(existing) + delta ≤
  100%` server-side and return the remaining available percentage on rejection.
- **Rationale**: FR-015a requires a hard global cap; the check must be authoritative and deterministic
  (Principles II, VIII). Aggregation is a pure domain calculation over the member's memberships.
- **Alternatives considered**: Per-profile-only validation (rejected — cannot detect cross-profile
  over-commitment); eventual/async check (rejected — must block synchronously at mutation time).

## R7. Historical contribution immutability & periods (FR-016, SC-006)

- **Decision**: Model contributions per **ContributionPeriod** (default monthly, configurable per profile).
  Expected amounts are **snapshotted** into the period when it opens; redistribution creates a new
  forward-effective plan version and never mutates closed/prior period snapshots. Contribution records are
  append-only.
- **Rationale**: SC-006 and FR-016 require historical records and prior expected amounts to remain
  unchanged after redistribution; snapshotting + plan versioning makes this structurally enforced.
- **Alternatives considered**: Recompute expected on read from current plan (rejected — would retroactively
  alter history, violating SC-006).

## R8. Caching strategy

- **Decision**: **Redis** as the cache layer with three tiers: (a) per-request **DataLoader** batching to
  kill GraphQL N+1; (b) short-TTL (30–60s) read-through cache for derived analytics (contribution
  standings, pool totals) keyed by `tenantId:profileId:periodId`, invalidated by the corresponding domain
  events (e.g., `ContributionRecorded`, `PercentageRedistributed`); (c) reference/config caching for tenant
  settings. Authoritative writes never read from cache.
- **Rationale**: Meets p95 < 200ms and SC-007's ≤5-second freshness bound while keeping money math
  authoritative (cache holds derived projections, not source-of-truth balances). The short TTL is a
  fallback ceiling; **event-driven invalidation** on `ContributionRecorded`/`PercentageRedistributed`/etc.
  is the primary mechanism that keeps standings/pool within the 5-second bound (fits Principle VI).
- **Alternatives considered**: In-process memory cache (rejected — incorrect across horizontally scaled
  instances); caching authoritative balances (rejected — risks stale money in calculations).

## R9. AI integration via OpenRouter (read-only coaching)

- **Decision**: A dedicated `ai-coaching` module calls **OpenRouter** with a **permission-scoped,
  read-only** projection of profile data (assembled by reusable analytics domain services — Principle X).
  The module has NO dependency on any write/command service; its output is advisory text + structured
  suggestions. Any suggestion that implies a change is surfaced to the user and only applied through the
  normal validated GraphQL mutation initiated by a permitted human (FR-023, SC-008). Prompts are built from
  the same deterministic figures used elsewhere; LLM responses are never written back to financial state.
- **Rationale**: Principles I, III, XI and FR-022/FR-023; enforces the AI boundary structurally (no write
  collaborators injected) rather than by convention.
- **Alternatives considered**: Letting AI call mutation tools directly (rejected — violates Principle III);
  embedding AI inside domain services (rejected — couples non-deterministic LLM to deterministic math).

## R10. Validation & error handling

- **Decision**: Input validation at the GraphQL boundary (class-validator/Zod DTOs) for shape, plus
  authoritative business validation in domain command handlers returning typed `Result`/domain errors
  mapped to GraphQL errors. Client-submitted monetary amounts are always recomputed server-side (FR-014).
- **Rationale**: Principle VIII; clients are untrusted. Two-stage validation separates shape from rules.
- **Alternatives considered**: Trusting client-computed amounts (rejected — banned by FR-014/Principle VIII).

---

## R11. Period auto-rollover & invitation expiry (scheduled jobs)

- **Decision**: Use **BullMQ repeatable jobs** (Redis) for time-driven transitions: (a) a per-profile
  period scheduler that auto-closes a `ContributionPeriod` at `endDate` and opens the next with a fresh
  income/plan snapshot (FR-016a); (b) an invitation-expiry sweep that transitions unanswered INVITED
  memberships to EXPIRED at `invitedAt + 14 days` (FR-002a). Both emit domain events via the outbox.
- **Rationale**: Deterministic, idempotent, tenant-scoped scheduling without coupling to request traffic;
  reuses the existing Redis/BullMQ infrastructure (R4).
- **Alternatives considered**: Cron at the OS level (rejected — not tenant-aware, harder to test);
  compute-on-read rollover (rejected — would mutate/ recompute snapshots, violating SC-006/FR-016a).

## R12. Optimistic concurrency

- **Decision**: Add an integer `version` column to mutable shared records (memberships, allocations,
  shared goals/debts/investments/budgets). Mutations accept `expectedVersion`; the repository performs a
  conditional update (`WHERE version = expectedVersion`) and returns a CONFLICT domain error on mismatch
  (FR-006a).
- **Rationale**: Prevents silent lost updates on shared financial data without pessimistic locking.
- **Alternatives considered**: Last-write-wins (rejected — silent data loss); row locks (rejected —
  contention/UX cost for collaborative editing).

## R13. Money scalar width (analysis I1)

- **Decision**: Represent money as **64-bit** integers end-to-end — Prisma `BigInt`, a GraphQL `BigInt`
  scalar (serialized as string) — never the 32-bit GraphQL `Int`.
- **Rationale**: FR-024 forbids precision loss; 32-bit Int caps at ~$21.5M in cents and would overflow for
  large pooled balances. 64-bit covers realistic financial magnitudes.
- **Alternatives considered**: GraphQL `Int` (rejected — overflow risk); `Float`/string-decimal at the
  domain layer (rejected — float banned; integers remain the domain representation).

---

**Outcome**: All decisions resolved; no open `NEEDS CLARIFICATION`. The previously carried ambiguities
(overpayment CHK029, departed-member responsibility CHK038, ownership-transfer mechanics CHK037) plus the
later clarifications (invitation lifecycle, income source, period rollover, archival, concurrency) are now
fully specified in spec.md and reflected in data-model.md and contracts/. Analysis findings I1 (money
scalar) and I2 (budget period) are resolved here and in the contract.
