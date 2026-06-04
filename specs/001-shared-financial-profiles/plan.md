# Implementation Plan: Shared Financial Profiles

**Branch**: `001-shared-financial-profiles` | **Date**: 2026-06-04 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-shared-financial-profiles/spec.md`

## Summary

Shared Financial Profiles lets users own one private personal profile and participate in multiple shared
profiles (households, couples, partnerships) with isolated, role-based permissions. Members allocate a
percentage of their income to each shared profile (capped at 100% across all profiles), the pool is the
emergent sum of contributions, and members collaboratively fund shared goals, debts, credit cards, and
investments while tracking contributions and per-member debt responsibility. Personal accounts stay fully
isolated. The platform is multi-tenant SaaS, event-driven, and AI-ready (read-only coaching surface).

Technical approach: a **domain-first, modular monolith** NestJS backend exposing **GraphQL**, with all
financial logic living in pure, deterministic domain layers (integer-cents money, no floating point).
**Prisma + PostgreSQL** provide persistence with row-level tenant isolation. A transactional **outbox**
publishes versioned domain events for event-driven scalability. A **Flutter** client consumes GraphQL
and holds no business logic. **OpenRouter** powers a strictly read-only AI coaching surface that can never
mutate financial state.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 20 LTS (backend); Dart 3.x / Flutter 3.x (mobile client)

**Primary Dependencies**: NestJS 10 (modular DI), Apollo Server / `@nestjs/graphql` (code-first GraphQL),
Prisma 5 (ORM + migrations), `graphql` + `dataloader` (N+1 batching), `class-validator`/Zod (input
validation), BullMQ + Redis (async event/job processing), OpenRouter SDK (LLM access for AI coaching),
`pino` (structured logging). Flutter client: `graphql_flutter`, `riverpod` (state), `freezed` (models).

**Storage**: PostgreSQL 16 (primary, multi-tenant with row-level security), Redis 7 (cache + BullMQ queue
+ event stream buffering)

**Testing**: Jest (backend unit + domain), Pact or schema-based contract tests for GraphQL, Supertest
(integration), `flutter_test`/`mocktail` (mobile). Domain calculation suites run in isolation with no I/O.

**Target Platform**: Linux server containers (backend, horizontally scalable behind a load balancer);
iOS 15+ / Android 9+ (Flutter mobile client)

**Project Type**: Mobile + API (Flutter client + NestJS GraphQL web service)

**Performance Goals**: GraphQL p95 < 200ms for read queries under nominal load; contribution/distribution
recomputation deterministic and < 50ms per profile; support 10k concurrent tenant users without
degradation (SC-002, SC-007 freshness within one query round-trip).

**Constraints**: All money as **64-bit** integer minor units (cents; Prisma `BigInt` + GraphQL `BigInt`
scalar — analysis I1); zero floating-point in financial paths; server-side validation authoritative;
tenant isolation enforced at the data layer by default; AI pathways read-only; domain layer free of
framework/I/O dependencies; **optimistic concurrency** (`version` column) on mutable shared records
(FR-006a); **BullMQ repeatable jobs** drive period auto-rollover (FR-016a) and 14-day invitation expiry
(FR-002a); sole-owner **archive** soft-closes a profile to read-only (FR-007c).

**Scale/Scope**: Multi-tenant SaaS; tens of thousands of tenants; per profile up to ~20 members and
hundreds of accounts/elements; 7 user stories, ~28 functional requirements, ~13 core entities.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | How the plan complies | Status |
|---|-----------|------------------------|--------|
| I | AI-Assisted OS | AI is decision-support only; coaching surface returns insights, never writes state | ✅ PASS |
| II | Deterministic Calculations | Pure domain functions (integer-cents), isolated unit tests, no time/locale/random in math | ✅ PASS |
| III | AI Boundary Enforcement | OpenRouter calls confined to a read-only `ai-coaching` module; no write access to domain services | ✅ PASS |
| IV | Domain-Layer Logic | All financial rules in `domain/` layers; GraphQL resolvers and Flutter contain orchestration/UI only | ✅ PASS |
| V | Permission-Isolated Profiles | Per-profile RBAC (Owner/Admin/Contributor/Viewer) enforced in domain + Prisma RLS; audit trail | ✅ PASS |
| VI | Event-Driven Scalability | Transactional outbox → versioned domain events → BullMQ consumers; replayable | ✅ PASS |
| VII | No Frontend Business Logic | Flutter renders/interacts only; all validation/calculation server-side | ✅ PASS |
| VIII | Server-Side Money Validation | Every mutation recomputes/validates amounts server-side before persistence | ✅ PASS |
| IX | SaaS Multi-Tenant | `tenant_id` on every row; RLS by default; tenant-scoped config; no code change to onboard | ✅ PASS |
| X | Reusable Analytics | Analytics/contribution computations are shared domain services callable by GraphQL, exports, AI | ✅ PASS |
| XI | AI Agent / Automation Ready | Versioned GraphQL contract; automation respects same domain boundaries, permissions, audit | ✅ PASS |

**Architectural constraints check**: integer-cents money ✅; immutable audit log ✅; versioned API
(GraphQL schema + event schema versions) ✅; tenant isolation default-on ✅; no financial logic in
migrations ✅.

**Result**: PASS — no violations. Complexity Tracking not required.

**Post-design re-check (2026-06-04, after clarifications)**: Still PASS. The added mechanisms uphold the
constitution — period rollover/invite-expiry are deterministic scheduled jobs (II), optimistic concurrency
protects money integrity (II/VIII), archival keeps history immutable (audit/Architectural Constraints),
64-bit money removes the precision-loss risk (II/VIII). No principle is weakened; no new violations.

## Project Structure

### Documentation (this feature)

```text
specs/001-shared-financial-profiles/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (GraphQL schema + domain event schemas)
│   ├── schema.graphql
│   └── events.md
├── checklists/          # requirements.md, requirements-gate.md (existing)
└── tasks.md             # Phase 2 output (/speckit-tasks - NOT created here)
```

### Source Code (repository root)

A monorepo with an `apps/api` NestJS backend (modular monolith, domain-first) and an `apps/mobile`
Flutter client, plus shared contract packages.

```text
apps/
├── api/                                 # NestJS GraphQL backend
│   ├── src/
│   │   ├── modules/                     # Feature modules (bounded contexts)
│   │   │   ├── profiles/
│   │   │   │   ├── domain/               # Pure entities, value objects, domain services (NO I/O)
│   │   │   │   │   ├── entities/
│   │   │   │   │   ├── value-objects/    # Money, Percentage, ContributionPlan
│   │   │   │   │   ├── services/         # ContributionCalculator, RedistributionService
│   │   │   │   │   └── events/           # Domain event definitions (versioned)
│   │   │   │   ├── application/          # Use cases / command+query handlers
│   │   │   │   ├── infrastructure/       # Prisma repositories, outbox writers
│   │   │   │   └── interface/            # GraphQL resolvers, DTOs, guards
│   │   │   ├── accounts/                 # Wallets, accounts, investments, emergency funds, cards, debts
│   │   │   ├── contributions/           # Allocation, tracking, periods, redistribution
│   │   │   ├── shared-elements/         # Shared goals, debts, credit cards, investments, budgets
│   │   │   ├── permissions/             # RBAC roles, guards, audit trail
│   │   │   ├── tenancy/                 # Tenant context, RLS plumbing
│   │   │   ├── events/                  # Outbox dispatcher, BullMQ consumers, event registry
│   │   │   ├── scheduling/              # BullMQ repeatable jobs: period rollover (FR-016a), invite expiry (FR-002a)
│   │   │   └── ai-coaching/             # READ-ONLY OpenRouter integration (no write deps)
│   │   ├── common/                      # Money lib, Result types, error mapping, logging
│   │   └── main.ts
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── migrations/
│   └── test/
│       ├── unit/                        # Domain calculation suites (isolated, deterministic)
│       ├── contract/                    # GraphQL schema/contract tests
│       └── integration/                 # Resolver + DB + RLS + outbox tests
├── mobile/                              # Flutter client (NO business logic)
│   ├── lib/
│   │   ├── features/                    # profiles/, contributions/, shared_elements/, coaching/
│   │   ├── graphql/                     # Generated client + queries/mutations
│   │   └── core/                        # DI, routing, theming
│   └── test/
packages/
└── contracts/                           # Shared GraphQL schema + event schema (source of truth)
```

**Structure Decision**: Mobile + API. The backend is a **domain-first modular monolith** — each module is
a bounded context split into `domain` (pure, deterministic, framework-free), `application` (use cases),
`infrastructure` (Prisma/outbox), and `interface` (GraphQL). This satisfies Principle IV (financial logic
isolated in domain), Principle VI (events module + outbox), and keeps the system modular enough to extract
services later without rework. Flutter consumes GraphQL only (Principle VII).

## Complexity Tracking

> No constitution violations — section intentionally empty.
