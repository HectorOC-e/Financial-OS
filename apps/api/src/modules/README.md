# API Module Map (finalized — T116)

Domain-first modular monolith. Each module is a bounded context layered as
`domain/` (pure, deterministic, framework-free — Principle IV) → `application/` (use cases,
one tenant transaction per command) → `infrastructure/` (Prisma repositories, outbox writers) →
`interface/` (GraphQL resolvers + DTOs; orchestration only).

| Module | Responsibility | Key invariants |
|--------|----------------|----------------|
| `tenancy` | Tenant context + PostgreSQL RLS plumbing; `withTenant(tx)` wraps every data access | Tenant isolation default-on (Principle IX) |
| `permissions` | Capability matrix (Owner/Admin/Contributor/Viewer), `@RequireCapability` guard, immutable audit trail | FR-006; rejected ops cause no state change (SC-003) |
| `events` | Transactional outbox → BullMQ dispatcher → versioned domain events registry | Events written atomically with state (Principle VI) |
| `scheduling` | BullMQ repeatable jobs: period auto-rollover (FR-016a), 14-day invitation expiry (FR-002a) | Deterministic scheduled transitions |
| `profiles` | Personal + shared profile lifecycle: create, invite/accept/decline/expire, roles, ownership transfer, archival | One OWNER; archived = read-only (FR-007c); optimistic concurrency (FR-006a) |
| `accounts` | Personal accounts (wallets, investments, …) + contribute-from-account | Isolation (FR-004/FR-010a); only the contributed amount enters the pool; single currency per profile (T111) |
| `contributions` | Allocation plans, periods, records, standings, redistribution, cross-profile cap, analytics core | Integer-cents only; plan versions preserve history (SC-006); cap ≤ 100% (FR-015a); Σ parts == total (SC-005) |
| `shared-elements` | Shared goals, debts (+ per-member responsibility), investments, period-scoped budgets | Overpayment rejected (FR-020b); responsibilities sum to 100% (FR-020a) |
| `ai-coaching` | READ-ONLY OpenRouter coaching surface with deterministic fallback | No write collaborators; redacted prompts (Principle III) |

## Cross-cutting (`src/common/`)

| Area | Contents |
|------|----------|
| `money/` | `Money` (64-bit integer cents, `bigint`), `Percentage` (basis points) + largest-remainder allocator (FR-024a) |
| `errors/` | `DomainError` taxonomy, `Result` type, GraphQL error mapper, full client-facing catalog (`catalog.ts`, T108) |
| `graphql/` | BigInt scalar, Money type, request context, cursor pagination (`pagination.ts`, T107) |
| `persistence/` | Prisma service, optimistic-concurrency helper (`version` column, FR-006a) |
| `cache/` | Shared Redis client, cache service, DataLoader factory |
| `throttling/` | Redis fixed-window rate limiting for mutations + AI coaching (T109); fails open |
| `observability/` | OTel tracer/meter + per-operation telemetry interceptor and structured logs (T110) |
| `config/` | Env validation; data-protection/PII posture (`data-protection.ts`, T112) |
| `pubsub/` | In-process pubsub backing GraphQL subscriptions |

## Test suites (`apps/api/test/`)

- `unit/` — pure domain (no I/O, no Prisma client): calculators, invariants, property-based
  allocator suites (`unit/property/`, T115). `pnpm test:unit`
- `contract/` — code-first SDL vs `packages/contracts/schema.graphql` (incl. full-graph
  conformance, T114). `pnpm test:contract`
- `integration/` — resolvers + Postgres RLS + Redis/outbox per user story (us1–us7).
  Requires `docker compose up -d postgres redis`. `pnpm test:integration`
