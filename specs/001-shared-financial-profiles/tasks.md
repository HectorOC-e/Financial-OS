---
description: "Task list for Shared Financial Profiles implementation"
---

# Tasks: Shared Financial Profiles

**Input**: Design documents from `/specs/001-shared-financial-profiles/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/schema.graphql, contracts/events.md, quickstart.md

**Tests**: Test tasks for financial **calculation/domain functions are REQUIRED by the project
constitution** (Principle II + Development Workflow — written and failing before implementation). GraphQL
contract tests and tenant-isolation (RLS) integration tests are also included.

**Organization**: Tasks are grouped by user story (US1–US7) for independent implementation and testing.

**Updated (2026-06-04)** to reflect clarifications: invitation decline/expiry (FR-002a), optimistic
concurrency (FR-006a), per-profile declared income (FR-011), period auto-rollover (FR-016a), profile
archival (FR-007c); and analysis fixes: 64-bit `BigInt` money (I1), period-scoped budgets (I2).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1–US7 (user story phases only; Setup/Foundational/Polish carry no story label)
- Paths follow the monorepo layout in plan.md (`apps/api`, `apps/mobile`, `packages/contracts`)

---

## Phase 1: Setup (Shared Infrastructure)

- [X] T001 Initialize pnpm monorepo workspace with `apps/api`, `apps/mobile`, `packages/contracts` (`pnpm-workspace.yaml`, root `package.json`)
- [X] T002 Scaffold NestJS application in `apps/api` (Nest CLI, `src/main.ts`, `src/app.module.ts`)
- [X] T003 [P] Add `docker-compose.yml` at repo root with PostgreSQL 16 and Redis 7 services
- [X] T004 [P] Initialize Prisma in `apps/api/prisma/schema.prisma` (PostgreSQL datasource; money columns as `BigInt`) and `.env.example` (`DATABASE_URL`, `REDIS_URL`, `OPENROUTER_API_KEY`)
- [X] T005 [P] Configure code-first GraphQL (`@nestjs/graphql`, Apollo) with a custom `BigInt` scalar (string-serialized) and SDL emit to `packages/contracts/schema.graphql`
- [X] T006 [P] Configure ESLint + Prettier + strict `tsconfig.json` in `apps/api`
- [X] T007 [P] Scaffold Flutter app in `apps/mobile` with `graphql_flutter`, `riverpod`, `freezed` (`apps/mobile/pubspec.yaml`) — NOTE: Flutter SDK not installed; run `flutter pub get` to fetch deps
- [X] T008 [P] Configure structured logging (`pino`) and a typed config module in `apps/api/src/common/`

**Checkpoint**: Toolchain ready — backend boots, GraphQL playground reachable, Prisma connects.

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**: Deterministic money/percentage primitives, tenancy, eventing, scheduling, concurrency, and permissions every story reuses.

### Money & determinism primitives (constitution Principle II — test-first)

- [X] T009 Write failing unit tests for `Money` value object (64-bit integer-cents arithmetic, same-currency guard, no float, large-value/no-overflow — FR-024/analysis I1) in `apps/api/test/unit/money.spec.ts`
- [X] T010 Implement `Money` value object (`bigint` internally) to pass tests in `apps/api/src/common/money/money.ts`
- [X] T011 Write failing unit tests for the **largest-remainder allocator** (floor shares, residual to largest remainders, stable membership-ID tie-break, exact reconciliation — FR-024a) in `apps/api/test/unit/largest-remainder.spec.ts`
- [X] T012 Implement `Percentage` (basis points) + `allocateByLargestRemainder()` to pass tests in `apps/api/src/common/money/percentage.ts`
- [X] T013 [P] Implement shared `Result`/domain-error types (including `CONFLICT` for optimistic concurrency and `FORBIDDEN`) + GraphQL error mapping in `apps/api/src/common/errors/`

### Persistence, tenancy, concurrency, eventing, scheduling (blocking)

- [X] T014 Define full Prisma schema per data-model.md — all entities with `tenantId`, money as `BigInt`, `version` columns on mutable shared records (Membership/allocations/shared elements), Membership status (INVITED/ACTIVE/DECLINED/EXPIRED/LEFT) + `invitationExpiresAt` + `declaredIncomeCents`, SharedProfile `status` + `archivedAt`, ContributionPeriod `incomeSnapshot`, SharedBudget `periodId` — in `apps/api/prisma/schema.prisma`
- [X] T015 Generate initial migration (schema only, NO business logic) in `apps/api/prisma/migrations/`
- [X] T016 Add PostgreSQL RLS policies for every tenant-scoped table keyed on `app.tenant_id` GUC (`apps/api/prisma/migrations/` rls migration)
- [X] T017 Implement `TenancyModule` (derive tenant, Prisma middleware/`$transaction` GUC setter, default-deny cross-tenant) in `apps/api/src/modules/tenancy/`
- [X] T018 Write failing integration test: tenant B cannot read tenant A rows (RLS) in `apps/api/test/integration/rls-isolation.spec.ts`
- [X] T019 [P] Write failing unit/integration tests for the **optimistic-concurrency repository helper** (conditional `WHERE version = expectedVersion`, CONFLICT on mismatch — FR-006a) in `apps/api/test/unit/optimistic-concurrency.spec.ts`
- [X] T020 Implement optimistic-concurrency repository base helper (version check + increment) in `apps/api/src/common/persistence/versioned-repository.ts`
- [X] T021 Implement transactional **outbox** (same-transaction writer, versioned envelope `schemaVersion`/`tenantId`/`aggregateId`/`occurredAt`) in `apps/api/src/modules/events/outbox/`
- [X] T022 Implement outbox dispatcher → BullMQ (Redis) relay with idempotency keys + tenant-context propagation in `apps/api/src/modules/events/dispatcher/`
- [X] T023 [P] Implement event registry/base consumer (`eventId` idempotency, replay safety) in `apps/api/src/modules/events/registry/`
- [X] T024 Implement **scheduling module** with BullMQ repeatable jobs infrastructure (tenant-aware, idempotent) in `apps/api/src/modules/scheduling/` (hosts period-rollover + invitation-expiry jobs added later)

### Permissions, audit, caching, GraphQL base (blocking)

- [X] T025 Implement RBAC: `MemberRole` enum + explicit **action→role capability matrix** (Owner/Admin/Contributor/Viewer) in `apps/api/src/modules/permissions/capability-matrix.ts`
- [X] T026 Implement `PermissionsGuard` (resolves role, enforces matrix, rejects with no state change — FR-006) in `apps/api/src/modules/permissions/permissions.guard.ts`
- [X] T027 [P] Implement immutable `AuditEntry` writer + audit consumer (actor, timestamp, before/after) in `apps/api/src/modules/permissions/audit/`
- [X] T028 [P] Implement Redis cache module + per-request DataLoader with event-driven invalidation hooks (R8) in `apps/api/src/common/cache/`
- [X] T029 Implement GraphQL request context (principal + tenant + membership), base scalars `UUID`/`DateTime`/`BigInt` and `Money` type in `apps/api/src/common/graphql/`
- [X] T030 [P] Implement reusable **analytics domain service** seam (single source for contribution/standing/pool computations — Principle X) in `apps/api/src/modules/contributions/domain/analytics/`
- [X] T031 [P] Generate Flutter GraphQL client codegen (incl. BigInt-as-string mapping) against `packages/contracts/schema.graphql` in `apps/mobile/lib/graphql/`

**Checkpoint**: Foundation ready — tenancy/RLS, money primitives, concurrency helper, outbox/events, scheduling, permissions, caching, GraphQL base in place.

---

## Phase 3: User Story 1 - Create & Govern a Shared Profile (Priority: P1) 🎯 MVP

**Goal**: Create shared profiles; invite/accept/decline members with 14-day expiry; assign isolated roles and enforce them; transfer ownership (nominate+accept); archive a sole-owner profile; keep personal data isolated; resolve concurrent edits — all audited.

**Independent Test**: Create a profile; invite + accept and invite + decline a member; confirm a Viewer write is rejected; confirm another member's personal accounts are invisible; confirm a stale-version role change returns CONFLICT; archive as sole owner and confirm read-only; confirm all changes are audited.

- [X] T032 [P] [US1] Implement `SharedProfile`, `PersonalProfile`, `Membership` domain entities + invariants (single OWNER; status machine INVITED→ACTIVE|DECLINED|EXPIRED→LEFT; ARCHIVED read-only) in `apps/api/src/modules/profiles/domain/entities/`
- [X] T033 [P] [US1] Write failing unit tests for membership/ownership invariants (single owner, nominate-and-accept FR-007b, owner-must-transfer-before-leave FR-007a, sole-owner archive FR-007c, status transitions FR-002a) in `apps/api/test/unit/membership-invariants.spec.ts`
- [X] T034 [US1] Implement Prisma repositories for profiles/memberships (tenant-scoped, version-checked via T020 helper) in `apps/api/src/modules/profiles/infrastructure/`
- [X] T035 [US1] Implement application use cases: createSharedProfile, inviteMember, acceptInvitation, declineInvitation, changeMemberRole (expectedVersion), leaveProfile, nominateOwner, acceptOwnership, archiveProfile in `apps/api/src/modules/profiles/application/`
- [X] T036 [US1] Implement the **invitation-expiry repeatable job** (transition unanswered INVITED → EXPIRED at invitedAt+14d) in `apps/api/src/modules/profiles/application/jobs/invitation-expiry.job.ts` (registered via scheduling module T024)
- [X] T037 [US1] Emit domain events via outbox (SharedProfileCreated, MemberInvited, InvitationAccepted, InvitationDeclined, InvitationExpired, MemberRoleChanged, MemberLeft, OwnerNominated, OwnershipTransferred, ProfileArchived) in `apps/api/src/modules/profiles/application/`
- [X] T038 [US1] Implement GraphQL resolvers + inputs (createSharedProfile, inviteMember, acceptInvitation, declineInvitation, changeMemberRole, leaveProfile, nominateOwner, acceptOwnership, archiveProfile; queries `sharedProfile`, `myMemberships`, `me`) guarded by `PermissionsGuard`; reject writes on ARCHIVED profiles in `apps/api/src/modules/profiles/interface/`
- [X] T039 [US1] Enforce personal-account isolation in profile/membership resolvers (other members' personal accounts never returned — FR-004) in `apps/api/src/modules/profiles/interface/`
- [X] T040 [US1] Wire audit entries for all membership/permission/ownership/archival changes (FR-007) in `apps/api/src/modules/profiles/application/`
- [X] T041 [P] [US1] Write failing integration test: Viewer write rejected, no state change (SC-003) in `apps/api/test/integration/us1-permissions.spec.ts`
- [X] T042 [P] [US1] Write failing integration test: cross-member personal-account invisibility (SC-004) in `apps/api/test/integration/us1-isolation.spec.ts`
- [X] T043 [P] [US1] Write failing integration test: stale-version mutation returns CONFLICT (FR-006a) in `apps/api/test/integration/us1-concurrency.spec.ts`
- [X] T044 [P] [US1] Write failing integration test: invitation decline + 14-day expiry transitions; archived profile is read-only (FR-002a, FR-007c) in `apps/api/test/integration/us1-lifecycle.spec.ts`
- [X] T045 [P] [US1] Implement Flutter profile-management feature (create/invite/accept/decline/role/transfer/archive) in `apps/mobile/lib/features/profiles/`
- [X] T046 [US1] Add GraphQL contract test asserting emitted SDL matches `packages/contracts/schema.graphql` for US1 operations in `apps/api/test/contract/schema.spec.ts`

**Checkpoint**: Full profile governance lifecycle works and is demoable (MVP).

---

## Phase 4: User Story 2 - Allocate Percentage-Based Income Contributions (Priority: P1)

**Goal**: Members self-declare per-profile income and allocate a percentage; expected contributions computed deterministically; cross-profile 100% cap enforced.

**Independent Test**: Set two members' declared incomes and percentages; confirm expected contributions and pool total are correct; confirm a >100% cross-profile allocation and an out-of-range percentage are both rejected; confirm an income change applies to the next period only.

- [X] T047 [P] [US2] Write failing unit tests for the **contribution calculator** (expected = declared income × percentage, deterministic, 64-bit cents, zero-income → zero) in `apps/api/test/unit/contribution-calculator.spec.ts`
- [X] T048 [US2] Implement `ContributionPlan`, `ContributionAllocation` domain entities + contribution calculator in `apps/api/src/modules/contributions/domain/`
- [X] T049 [P] [US2] Write failing unit tests for the **cross-profile 100% cap** (sum across all memberships ≤ 100%, returns remaining % on rejection — FR-015a) in `apps/api/test/unit/cross-profile-cap.spec.ts`
- [X] T050 [US2] Implement cross-profile committed-percentage aggregation service in `apps/api/src/modules/contributions/domain/cross-profile-cap.ts`
- [X] T051 [US2] Implement Prisma repositories for plans/allocations (tenant-scoped, version-checked) in `apps/api/src/modules/contributions/infrastructure/`
- [X] T052 [US2] Implement use cases `setDeclaredIncome` (FR-011, forward-only effect) and `setAllocation` (server-side recompute/validate; FR-013/FR-014/FR-015a) emitting `DeclaredIncomeSet`/`AllocationSet` in `apps/api/src/modules/contributions/application/`
- [X] T053 [US2] Implement GraphQL resolvers: `setDeclaredIncome`, `setAllocation`, query `remainingAllocationPercentageBp`, expose `Membership.declaredIncome`/`allocationPercentageBp`, `SharedProfile.poolTotal` in `apps/api/src/modules/contributions/interface/`
- [X] T054 [P] [US2] Write failing integration test: >100% cross-profile allocation rejected with remaining % (FR-015a) in `apps/api/test/integration/us2-cap.spec.ts`
- [X] T055 [P] [US2] Implement Flutter allocation UI (declare income, set %, view remaining %) in `apps/mobile/lib/features/contributions/allocation/`

**Checkpoint**: Members allocate income percentages with deterministic expected contributions and an enforced global cap.

---

## Phase 5: User Story 3 - Track Contributions Against Allocations (Priority: P2)

**Goal**: Record actual contributions per period; report standings and funding status, fresh within 5 seconds; periods auto-roll with immutable snapshots.

**Independent Test**: Record contributions; confirm exact standings and pool reconciliation; confirm standings reflect a new contribution within 5 seconds; confirm a period auto-closes and the next opens with a fresh snapshot.

- [X] T056 [P] [US3] Write failing unit tests for the **standing calculator** (expected vs actual → variance + ON_TRACK/AHEAD/BEHIND, exact amounts) in `apps/api/test/unit/standing-calculator.spec.ts`
- [X] T057 [US3] Implement `ContributionPeriod` (snapshot plan version + per-member income on open — R7/FR-016a), `ContributionRecord` (append-only) entities + standing calculator in `apps/api/src/modules/contributions/domain/`
- [X] T058 [US3] Implement the **period auto-rollover repeatable job** (auto-close at endDate, open next with fresh snapshot; forward-only changes — FR-016a) in `apps/api/src/modules/contributions/application/jobs/period-rollover.job.ts` (registered via scheduling module T024)
- [X] T059 [US3] Implement `recordContribution` use case (append-only, server-side validated) emitting `ContributionRecorded`; emit `ContributionPeriodOpened`/`ContributionPeriodClosed` in `apps/api/src/modules/contributions/application/`
- [X] T060 [US3] Implement reconciliation in the analytics service (pool == Σ records exactly; shortfall tracked, never blocks — FR-019/SC-005) in `apps/api/src/modules/contributions/domain/analytics/`
- [X] T061 [US3] Implement GraphQL resolvers: `recordContribution`, `Membership.standing`, `SharedProfile.currentPeriod` in `apps/api/src/modules/contributions/interface/`
- [X] T062 [US3] Implement event-driven cache invalidation for standings/pool on `ContributionRecorded` to meet ≤5s freshness (SC-007) in `apps/api/src/modules/contributions/infrastructure/cache/`
- [X] T063 [US3] Implement GraphQL subscriptions `contributionStandingChanged`, `poolTotalChanged` (authorization-scoped) in `apps/api/src/modules/contributions/interface/`
- [X] T064 [P] [US3] Write failing integration test: reconciliation zero-variance after all records (SC-005) in `apps/api/test/integration/us3-reconciliation.spec.ts`
- [X] T065 [P] [US3] Write failing integration test: standing reflects a new contribution within 5 seconds (SC-007) in `apps/api/test/integration/us3-freshness.spec.ts`
- [X] T066 [P] [US3] Write failing integration test: period auto-rollover opens a fresh immutable snapshot; closed period unchanged (FR-016a) in `apps/api/test/integration/us3-rollover.spec.ts`
- [X] T067 [P] [US3] Implement Flutter contribution-tracking UI (record + standings dashboard, live updates) in `apps/mobile/lib/features/contributions/tracking/`

**Checkpoint**: Contributions tracked with exact standings, ≤5s freshness, and auto-rolling periods.

---

## Phase 6: User Story 4 - Dynamically Redistribute Percentages (Priority: P2)

**Goal**: Authorized members redistribute percentages; new expected contributions apply forward (next period) while history is preserved.

**Independent Test**: Redistribute; confirm a new plan version applies to the next period and prior-period expected amounts and records are unchanged.

- [ ] T068 [P] [US4] Write failing unit tests for **plan versioning** (redistribution creates new version, prior snapshots immutable, forward-only — FR-016/FR-016a/SC-006) in `apps/api/test/unit/plan-versioning.spec.ts`
- [ ] T069 [US4] Implement plan-versioning logic (new `ContributionPlan.version`, `effectiveFromPeriodId`, never mutate closed periods) in `apps/api/src/modules/contributions/domain/redistribution.ts`
- [ ] T070 [US4] Implement `redistribute` use case (re-applies cross-profile cap + range validation) emitting `PercentageRedistributed` in `apps/api/src/modules/contributions/application/`
- [ ] T071 [US4] Implement GraphQL resolver `redistribute` returning new `ContributionPlan` in `apps/api/src/modules/contributions/interface/`
- [ ] T072 [US4] Invalidate standing/pool caches on `PercentageRedistributed` (forward only) in `apps/api/src/modules/contributions/infrastructure/cache/`
- [ ] T073 [P] [US4] Write failing integration test: prior-period expected amounts + records unchanged after redistribution (SC-006) in `apps/api/test/integration/us4-history.spec.ts`
- [ ] T074 [US4] Wire audit entries for redistribution events in `apps/api/src/modules/contributions/application/`
- [ ] T075 [P] [US4] Implement Flutter redistribution UI (edit percentages, effective-next-period note) in `apps/mobile/lib/features/contributions/redistribution/`

**Checkpoint**: Forward-only redistribution with provably preserved history.

---

## Phase 7: User Story 5 - Manage Shared Financial Elements (Priority: P2)

**Goal**: Create/manage shared goals, debts, credit cards, investments, period-scoped budgets funded from the pool; enforce overpayment rejection, debt-responsibility rules, and optimistic concurrency.

**Independent Test**: Create a goal and a debt; fund/pay from the pool with exact balance changes; confirm overpayment rejected; confirm debt responsibilities default to contribution % and sum to 100%; confirm a stale-version edit returns CONFLICT; confirm a budget is period-scoped.

- [ ] T076 [P] [US5] Write failing unit tests for **overpayment rejection** (payment ≤ outstanding; balance never < 0 — FR-020b/FR-024) in `apps/api/test/unit/overpayment.spec.ts`
- [ ] T077 [P] [US5] Write failing unit tests for **debt-responsibility rules** (default to contribution %, overridable, sum to 100%, proportional reassign on leave — FR-020a) in `apps/api/test/unit/debt-responsibility.spec.ts`
- [ ] T078 [P] [US5] Implement `SharedGoal` entity + funding logic (exact amount — FR-020) in `apps/api/src/modules/shared-elements/domain/goal.ts`
- [ ] T079 [P] [US5] Implement `SharedDebt`/`SharedCreditCard` entity + payment logic with overpayment rejection in `apps/api/src/modules/shared-elements/domain/debt.ts`
- [ ] T080 [P] [US5] Implement `DebtResponsibility` + proportional reassignment-on-leave (uses largest-remainder allocator) in `apps/api/src/modules/shared-elements/domain/debt-responsibility.ts`
- [ ] T081 [P] [US5] Implement `SharedInvestment` and period-scoped `SharedBudget` (remaining = limit − spent; resets per period — FR-018/analysis I2) in `apps/api/src/modules/shared-elements/domain/`
- [ ] T082 [US5] Implement Prisma repositories for shared elements (tenant-scoped, version-checked — FR-006a) in `apps/api/src/modules/shared-elements/infrastructure/`
- [ ] T083 [US5] Implement application use cases: createSharedGoal, fundGoal, paySharedDebt, setDebtResponsibility (all with `expectedVersion`), budget create/record-spend, investment value update in `apps/api/src/modules/shared-elements/application/`
- [ ] T084 [US5] Hook `MemberLeft` consumer to reassign debt responsibilities proportionally (FR-020a) in `apps/api/src/modules/shared-elements/application/`
- [ ] T085 [US5] Emit events (GoalFunded, SharedDebtPaid, DebtResponsibilitySet) via outbox in `apps/api/src/modules/shared-elements/application/`
- [ ] T086 [US5] Implement GraphQL resolvers + inputs (with `expectedVersion`) for goals/debts/credit cards/investments/budgets, scoped by permission (Viewer read-only); reject writes on ARCHIVED profiles in `apps/api/src/modules/shared-elements/interface/`
- [ ] T087 [P] [US5] Write failing integration test: overpayment rejected, balance unchanged (FR-020b) in `apps/api/test/integration/us5-overpayment.spec.ts`
- [ ] T088 [P] [US5] Write failing integration test: shortfall does NOT block goal funding / debt payment (FR-019) in `apps/api/test/integration/us5-shortfall-nonblocking.spec.ts`
- [ ] T089 [P] [US5] Write failing integration test: debt responsibilities reassign proportionally and still sum to 100% after a member leaves (FR-020a) in `apps/api/test/integration/us5-reassign.spec.ts`
- [ ] T090 [P] [US5] Implement Flutter shared-elements UI (goals, debts, credit cards, investments, budgets) in `apps/mobile/lib/features/shared_elements/`
- [ ] T091 [US5] Add GraphQL contract tests for shared-element operations in `apps/api/test/contract/schema.spec.ts`
- [ ] T092 [US5] Wire audit entries for shared-element financially significant mutations (FR-007/Architectural Constraints) in `apps/api/src/modules/shared-elements/application/`

**Checkpoint**: Shared elements fully manageable with enforced money-integrity and concurrency rules.

---

## Phase 8: User Story 6 - Maintain Isolated Personal Accounts (Priority: P3)

**Goal**: Users hold personal accounts (all types) isolated from shared profiles; contributing moves only the contributed amount.

**Independent Test**: Create personal accounts; confirm invisible to other members and excluded from pool; contribute from one and confirm only the contributed amount enters the pool.

- [ ] T093 [P] [US6] Implement `Account` entity with single-profile ownership (PERSONAL|SHARED, exactly one profile — FR-010a) and all account types in `apps/api/src/modules/accounts/domain/account.ts`
- [ ] T094 [US6] Implement Prisma repository + use cases for personal accounts (create/list, tenant + user scoped) in `apps/api/src/modules/accounts/`
- [ ] T095 [US6] Implement GraphQL resolvers exposing `PersonalProfile.accounts` only to the owning user; exclude from shared pool calculations (FR-010) in `apps/api/src/modules/accounts/interface/`
- [ ] T096 [US6] Implement contribute-from-account flow so only the contributed amount enters the pool, not the account balance (FR-010) in `apps/api/src/modules/accounts/application/`
- [ ] T097 [P] [US6] Write failing integration test: personal account invisible to other members and excluded from pool (FR-004, FR-010a) in `apps/api/test/integration/us6-personal-isolation.spec.ts`
- [ ] T098 [P] [US6] Implement Flutter personal-accounts UI in `apps/mobile/lib/features/accounts/`

**Checkpoint**: Personal accounts coexist with shared participation under full isolation.

---

## Phase 9: User Story 7 - AI Financial Coaching Readiness (Priority: P3)

**Goal**: Expose a permission-scoped, read-only coaching surface via OpenRouter that can never mutate financial state.

**Independent Test**: Request coaching insights; confirm data is permission-scoped, no state change occurs, and applying a suggestion requires a normal validated mutation.

- [ ] T099 [P] [US7] Implement read-only coaching read-model projection (assembled from reusable analytics service; no write collaborators — Principle III/R9) in `apps/api/src/modules/ai-coaching/domain/`
- [ ] T100 [US7] Implement OpenRouter client with permission-scoped, redacted prompt assembly (define included fields) in `apps/api/src/modules/ai-coaching/infrastructure/openrouter.client.ts`
- [ ] T101 [US7] Implement `coachingInsights` query returning `CoachingInsight`/`CoachingSuggestion` (advisory only; `suggestedMutation` is a hint) in `apps/api/src/modules/ai-coaching/interface/`
- [ ] T102 [US7] Implement graceful degradation for OpenRouter timeout/unavailability (defined fallback) in `apps/api/src/modules/ai-coaching/infrastructure/`
- [ ] T103 [US7] Subscribe a READ-ONLY projection consumer to `ContributionRecorded`/`PercentageRedistributed` to refresh the coaching read model (no commands emitted) in `apps/api/src/modules/ai-coaching/application/`
- [ ] T104 [P] [US7] Write failing integration test: coaching path produces 0 state changes (no outbox/audit writes) — SC-008 in `apps/api/test/integration/us7-ai-readonly.spec.ts`
- [ ] T105 [P] [US7] Write failing integration test: coaching data respects requester permission scope (FR-022) in `apps/api/test/integration/us7-ai-scope.spec.ts`
- [ ] T106 [P] [US7] Implement Flutter coaching UI (insights + suggestions; applying routes through normal mutations) in `apps/mobile/lib/features/coaching/`

**Checkpoint**: AI coaching available and structurally incapable of mutating financial state.

---

## Phase 10: Polish & Cross-Cutting Concerns

- [ ] T107 [P] Add cursor pagination to unbounded GraphQL list fields (members, contribution records, goals) in `apps/api/src/common/graphql/pagination.ts` (design-gate CHK017)
- [ ] T108 [P] Define and document the domain error taxonomy + GraphQL error codes (incl. CONFLICT/FORBIDDEN) in `apps/api/src/common/errors/catalog.ts` (design-gate CHK016)
- [ ] T109 [P] Add rate limiting for mutations and OpenRouter calls in `apps/api/src/common/throttling/` (design-gate CHK027)
- [ ] T110 [P] Add metrics + tracing (OpenTelemetry) and structured-log fields in `apps/api/src/common/observability/` (design-gate CHK004)
- [ ] T111 [P] Add currency-mismatch rejection guard (single currency per profile) in `apps/api/src/modules/shared-elements/domain/` (design-gate CHK041)
- [ ] T112 [P] Add data-at-rest encryption / PII-handling configuration for financial fields (analysis C1, design-gate CHK026)
- [ ] T113 Run `quickstart.md` end-to-end validation scenarios and record results in `specs/001-shared-financial-profiles/quickstart.md`
- [ ] T114 [P] Verify SDL export matches `packages/contracts/schema.graphql` and run full contract suite (`pnpm test:contract`)
- [ ] T115 [P] Add property-based tests for largest-remainder allocator and reconciliation invariants in `apps/api/test/unit/property/`
- [ ] T116 Update `CLAUDE.md` and module READMEs with finalized module map and run `pnpm test` (all suites green)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup — **BLOCKS all user stories**.
- **User Stories (Phases 3–9)**: All depend on Foundational. Priority order P1 → P2 → P3.
- **Polish (Phase 10)**: Depends on the targeted user stories being complete.

### User Story Dependencies

- **US1 (P1)**: Depends only on Foundational (uses scheduling T024 for invite-expiry, concurrency helper T020).
- **US2 (P1)**: Depends on Foundational; uses US1 memberships.
- **US3 (P2)**: Depends on US2 (allocations/income) + scheduling T024 (period rollover).
- **US4 (P2)**: Depends on US2/US3 (plans + periods).
- **US5 (P2)**: Depends on US1 (permissions) + US2 (pool); `MemberLeft` reassignment depends on US1.
- **US6 (P3)**: Depends on Foundational + US1 (profiles); largely independent of contribution stories.
- **US7 (P3)**: Depends on analytics seam (Foundational) + US2/US3 data; read-only.

### Within Each User Story

- Calculation/invariant unit tests (constitution) written and FAILING before implementation.
- Domain entities/services → repositories → application use cases → events/jobs → GraphQL resolvers → mobile UI.

### Parallel Opportunities

- All `[P]` Setup tasks (T003–T008) run together.
- Foundational `[P]` tasks (T013, T019, T023, T027, T028, T030, T031) run together once prerequisites land.
- Within a story, `[P]` domain/test/mobile tasks on different files run together (e.g., US5 T076–T081, T087–T090).
- After Foundational, P3 stories US6 and US7 can be staffed in parallel with later P2 work.

---

## Parallel Example: User Story 1

```bash
# Failing invariant tests first:
Task: "T033 membership/ownership invariants in apps/api/test/unit/membership-invariants.spec.ts"

# Then parallel integration tests (different files):
Task: "T041 Viewer permission rejection in apps/api/test/integration/us1-permissions.spec.ts"
Task: "T042 personal-account isolation in apps/api/test/integration/us1-isolation.spec.ts"
Task: "T043 stale-version CONFLICT in apps/api/test/integration/us1-concurrency.spec.ts"
Task: "T044 invitation decline/expiry + archive in apps/api/test/integration/us1-lifecycle.spec.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Complete Phase 1 (Setup) + Phase 2 (Foundational).
2. Complete Phase 3 (US1).
3. **STOP and VALIDATE**: full profile governance lifecycle (create/invite/accept/decline/expire/roles/transfer/archive) with isolation and concurrency — independently demoable.

### Incremental Delivery

1. Setup + Foundational → foundation ready.
2. + US1 (govern) → MVP.
3. + US2 (allocate) → contributions plan.
4. + US3 (track) → accountability with auto-rolling periods.
5. + US4 (redistribute) → adaptability with preserved history.
6. + US5 (shared elements) → tangible outcomes.
7. + US6 (personal isolation) and US7 (AI readiness) → completeness.

Each increment is independently testable and adds value without breaking prior stories.
