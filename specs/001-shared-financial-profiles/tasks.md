---
description: "Task list for Shared Financial Profiles implementation"
---

# Tasks: Shared Financial Profiles

**Input**: Design documents from `/specs/001-shared-financial-profiles/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/schema.graphql, contracts/events.md, quickstart.md

**Tests**: Test tasks for financial **calculation/domain functions are REQUIRED by the project
constitution** (Principle II + Development Workflow — written and failing before implementation). GraphQL
contract tests and tenant-isolation (RLS) integration tests are also included. Other UI/integration tests
are included where they protect a constitutional invariant.

**Organization**: Tasks are grouped by user story (US1–US7) for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1–US7 (user story phases only; Setup/Foundational/Polish carry no story label)
- Paths follow the monorepo layout in plan.md (`apps/api`, `apps/mobile`, `packages/contracts`)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and toolchain

- [ ] T001 Initialize pnpm monorepo workspace with `apps/api`, `apps/mobile`, `packages/contracts` in repo root (`pnpm-workspace.yaml`, root `package.json`)
- [ ] T002 Scaffold NestJS application in `apps/api` (Nest CLI, `src/main.ts`, `src/app.module.ts`)
- [ ] T003 [P] Add `docker-compose.yml` at repo root with PostgreSQL 16 and Redis 7 services
- [ ] T004 [P] Initialize Prisma in `apps/api/prisma/schema.prisma` with PostgreSQL datasource and `.env.example` (`DATABASE_URL`, `REDIS_URL`, `OPENROUTER_API_KEY`)
- [ ] T005 [P] Configure code-first GraphQL (`@nestjs/graphql`, Apollo driver) in `apps/api/src/app.module.ts` with SDL emit to `packages/contracts/schema.graphql`
- [ ] T006 [P] Configure ESLint + Prettier + strict `tsconfig.json` in `apps/api`
- [ ] T007 [P] Scaffold Flutter app in `apps/mobile` with `graphql_flutter`, `riverpod`, `freezed` dependencies (`apps/mobile/pubspec.yaml`)
- [ ] T008 [P] Configure structured logging (`pino`) and a typed config module in `apps/api/src/common/`

**Checkpoint**: Toolchain ready — backend boots, GraphQL playground reachable, Prisma connects.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that ALL user stories depend on. No user story may begin until this phase completes.

**⚠️ CRITICAL**: Includes the deterministic money/percentage primitives every financial calculation reuses.

### Money & determinism primitives (constitution Principle II — test-first)

- [ ] T009 Write failing unit tests for `Money` value object (integer-cents arithmetic, same-currency guard, no float) in `apps/api/test/unit/money.spec.ts`
- [ ] T010 Implement `Money` value object to pass tests in `apps/api/src/common/money/money.ts`
- [ ] T011 Write failing unit tests for the **largest-remainder allocator** (floor shares, distribute residual to largest remainders, stable membership-ID tie-break, exact reconciliation — FR-024a) in `apps/api/test/unit/largest-remainder.spec.ts`
- [ ] T012 Implement `Percentage` (basis points) + `allocateByLargestRemainder()` to pass tests in `apps/api/src/common/money/percentage.ts`
- [ ] T013 [P] Implement shared `Result`/domain-error types and GraphQL error mapping in `apps/api/src/common/errors/`

### Persistence, tenancy, eventing (blocking)

- [ ] T014 Define full Prisma schema for all entities (Tenant, User, PersonalProfile, SharedProfile, Membership, Account, ContributionPlan, ContributionAllocation, ContributionPeriod, ContributionRecord, SharedGoal, SharedDebt, DebtResponsibility, SharedInvestment, SharedBudget, AuditEntry, OutboxEvent) with `tenantId` on every tenant-scoped table per data-model.md in `apps/api/prisma/schema.prisma`
- [ ] T015 Generate initial migration (schema only, NO business logic — Architectural Constraints) in `apps/api/prisma/migrations/`
- [ ] T016 Add PostgreSQL RLS policies for every tenant-scoped table keyed on `app.tenant_id` session GUC (SQL in `apps/api/prisma/migrations/` rls migration)
- [ ] T017 Implement `TenancyModule`: derive tenant from authenticated principal, Prisma middleware/`$transaction` wrapper setting `app.tenant_id`, default-deny cross-tenant in `apps/api/src/modules/tenancy/`
- [ ] T018 Write failing integration test proving a query under tenant B cannot read tenant A rows (RLS) in `apps/api/test/integration/rls-isolation.spec.ts`
- [ ] T019 Implement transactional **outbox**: `OutboxEvent` writer bound to the same transaction as state changes, versioned envelope (`schemaVersion`, `tenantId`, `aggregateId`, `occurredAt`) in `apps/api/src/modules/events/outbox/`
- [ ] T020 Implement outbox dispatcher → BullMQ (Redis) relay with idempotency keys and tenant-context propagation for async consumers (events.md) in `apps/api/src/modules/events/dispatcher/`
- [ ] T021 [P] Implement event registry/base consumer with `eventId` idempotency and replay safety in `apps/api/src/modules/events/registry/`

### Permissions, audit, caching, GraphQL base (blocking)

- [ ] T022 Implement RBAC: `MemberRole` enum + explicit **action→role capability matrix** (Owner/Admin/Contributor/Viewer) in `apps/api/src/modules/permissions/capability-matrix.ts`
- [ ] T023 Implement `PermissionsGuard` (resolves caller membership role, enforces capability matrix, rejects with no state change — FR-006) in `apps/api/src/modules/permissions/permissions.guard.ts`
- [ ] T024 [P] Implement immutable `AuditEntry` writer + audit consumer (actor, timestamp, before/after) in `apps/api/src/modules/permissions/audit/`
- [ ] T025 [P] Implement Redis cache module + per-request DataLoader infrastructure with event-driven invalidation hooks (R8) in `apps/api/src/common/cache/`
- [ ] T026 Implement GraphQL request context (authenticated principal + tenant + membership resolution) and base `scalar UUID`/`DateTime`, `Money` type in `apps/api/src/common/graphql/`
- [ ] T027 [P] Implement reusable **analytics domain service** seam (single source for contribution/standing/pool computations callable by GraphQL, exports, AI — Principle X) in `apps/api/src/modules/contributions/domain/analytics/`
- [ ] T028 [P] Generate Flutter GraphQL client codegen wiring against `packages/contracts/schema.graphql` in `apps/mobile/lib/graphql/`

**Checkpoint**: Foundation ready — tenancy/RLS, money primitives, permissions, outbox/events, caching, and GraphQL base all in place. User stories can now proceed.

---

## Phase 3: User Story 1 - Create & Govern a Shared Profile (Priority: P1) 🎯 MVP

**Goal**: Create shared profiles, invite/accept members, assign isolated permission roles, enforce them, transfer ownership, and keep personal data isolated — all audited.

**Independent Test**: Create a profile, invite + accept a second member, assign a role, confirm Viewer writes are rejected, confirm the other member's personal accounts are invisible, and confirm role/membership changes are audited.

- [ ] T029 [P] [US1] Implement `SharedProfile`, `PersonalProfile`, `Membership` domain entities + invariants (exactly one OWNER; membership state machine INVITED→ACTIVE→LEFT) in `apps/api/src/modules/profiles/domain/entities/`
- [ ] T030 [P] [US1] Write failing unit tests for membership/ownership invariants (single owner, nominate-and-accept transfer FR-007b, owner-must-transfer-before-leave FR-007a) in `apps/api/test/unit/membership-invariants.spec.ts`
- [ ] T031 [US1] Implement Prisma repositories for profiles/memberships (tenant-scoped) in `apps/api/src/modules/profiles/infrastructure/`
- [ ] T032 [US1] Implement application use cases: createSharedProfile, inviteMember, acceptInvitation, changeMemberRole, leaveProfile, nominateOwner, acceptOwnership in `apps/api/src/modules/profiles/application/`
- [ ] T033 [US1] Emit domain events (SharedProfileCreated, MemberInvited, InvitationAccepted, MemberRoleChanged, MemberLeft, OwnerNominated, OwnershipTransferred) via outbox in `apps/api/src/modules/profiles/application/`
- [ ] T034 [US1] Implement GraphQL resolvers + inputs (createSharedProfile, inviteMember, acceptInvitation, changeMemberRole, leaveProfile, nominateOwner, acceptOwnership; queries `sharedProfile`, `myMemberships`, `me`) guarded by `PermissionsGuard` in `apps/api/src/modules/profiles/interface/`
- [ ] T035 [US1] Enforce personal-account isolation in the `sharedProfile`/membership resolvers (other members' personal accounts never returned — FR-004) in `apps/api/src/modules/profiles/interface/`
- [ ] T036 [US1] Wire audit entries for all membership/permission/ownership changes (FR-007) in `apps/api/src/modules/profiles/application/`
- [ ] T037 [P] [US1] Write failing integration test: Viewer write rejected with no state change (SC-003) in `apps/api/test/integration/us1-permissions.spec.ts`
- [ ] T038 [P] [US1] Write failing integration test: cross-member personal-account invisibility (SC-004) in `apps/api/test/integration/us1-isolation.spec.ts`
- [ ] T039 [P] [US1] Implement Flutter profile-management feature (create/invite/accept/role/transfer) in `apps/mobile/lib/features/profiles/`
- [ ] T040 [US1] Add GraphQL contract test asserting emitted SDL matches `packages/contracts/schema.graphql` for US1 operations in `apps/api/test/contract/schema.spec.ts`

**Checkpoint**: A shared profile can be created, governed with isolated permissions, ownership transferred, and personal data stays private — independently demoable (MVP).

---

## Phase 4: User Story 2 - Allocate Percentage-Based Income Contributions (Priority: P1)

**Goal**: Members declare income and allocate a percentage; the system computes expected contributions deterministically and enforces the cross-profile 100% cap.

**Independent Test**: Set two members' incomes and percentages; confirm expected contributions and pool total are correct; confirm a >100% cross-profile allocation and an out-of-range percentage are both rejected.

- [ ] T041 [P] [US2] Write failing unit tests for the **contribution calculator** (expected = income × percentage, deterministic, integer-cents, zero-income → zero) in `apps/api/test/unit/contribution-calculator.spec.ts`
- [ ] T042 [US2] Implement `ContributionPlan`, `ContributionAllocation` domain entities + contribution calculator in `apps/api/src/modules/contributions/domain/`
- [ ] T043 [P] [US2] Write failing unit tests for the **cross-profile 100% cap** (sum across all memberships ≤ 100%, returns remaining % on rejection — FR-015a) in `apps/api/test/unit/cross-profile-cap.spec.ts`
- [ ] T044 [US2] Implement cross-profile committed-percentage aggregation service in `apps/api/src/modules/contributions/domain/cross-profile-cap.ts`
- [ ] T045 [US2] Implement Prisma repositories for plans/allocations (tenant-scoped) in `apps/api/src/modules/contributions/infrastructure/`
- [ ] T046 [US2] Implement application use case `setAllocation` with server-side recomputation/validation (FR-013, FR-014, FR-015a) emitting `AllocationSet` in `apps/api/src/modules/contributions/application/`
- [ ] T047 [US2] Implement GraphQL resolvers: `setAllocation`, query `remainingAllocationPercentageBp`, expose `Membership.allocationPercentageBp` and `SharedProfile.poolTotal` in `apps/api/src/modules/contributions/interface/`
- [ ] T048 [P] [US2] Write failing integration test: >100% cross-profile allocation rejected with remaining % message (FR-015a) in `apps/api/test/integration/us2-cap.spec.ts`
- [ ] T049 [P] [US2] Implement Flutter allocation UI (declare income, set %, view remaining/available %) in `apps/mobile/lib/features/contributions/allocation/`

**Checkpoint**: Members can allocate income percentages with deterministic expected contributions and an enforced global cap.

---

## Phase 5: User Story 3 - Track Contributions Against Allocations (Priority: P2)

**Goal**: Record actual contributions per period and report each member's standing and the profile funding status, fresh within 5 seconds.

**Independent Test**: Record contributions; confirm standings (on track/ahead/behind by exact amount), exact reconciliation of pool total, and that standings reflect a new contribution within 5 seconds.

- [ ] T050 [P] [US3] Write failing unit tests for the **standing calculator** (expected vs actual → variance + ON_TRACK/AHEAD/BEHIND, exact amounts) in `apps/api/test/unit/standing-calculator.spec.ts`
- [ ] T051 [US3] Implement `ContributionPeriod` (snapshot expected on open — R7), `ContributionRecord` (append-only) entities + standing calculator in `apps/api/src/modules/contributions/domain/`
- [ ] T052 [US3] Implement period lifecycle (open/close) emitting `ContributionPeriodOpened`/`ContributionPeriodClosed` (snapshot plan version) in `apps/api/src/modules/contributions/application/`
- [ ] T053 [US3] Implement `recordContribution` use case (append-only, server-side validated) emitting `ContributionRecorded` in `apps/api/src/modules/contributions/application/`
- [ ] T054 [US3] Implement reconciliation in the analytics service: pool total == Σ records exactly, shortfall tracked never blocks (FR-019, SC-005) in `apps/api/src/modules/contributions/domain/analytics/`
- [ ] T055 [US3] Implement GraphQL resolvers: `recordContribution`, `Membership.standing`, `SharedProfile.currentPeriod` in `apps/api/src/modules/contributions/interface/`
- [ ] T056 [US3] Implement event-driven cache invalidation for standings/pool on `ContributionRecorded` to meet ≤5s freshness (SC-007) in `apps/api/src/modules/contributions/infrastructure/cache/`
- [ ] T057 [US3] Implement GraphQL subscriptions `contributionStandingChanged`, `poolTotalChanged` (authorization-scoped) in `apps/api/src/modules/contributions/interface/`
- [ ] T058 [P] [US3] Write failing integration test: reconciliation zero-variance after all records (SC-005) in `apps/api/test/integration/us3-reconciliation.spec.ts`
- [ ] T059 [P] [US3] Write failing integration test: standing reflects a new contribution within 5 seconds (SC-007) in `apps/api/test/integration/us3-freshness.spec.ts`
- [ ] T060 [P] [US3] Implement Flutter contribution-tracking UI (record + standings dashboard, live updates) in `apps/mobile/lib/features/contributions/tracking/`

**Checkpoint**: Contributions are tracked with exact standings and ≤5s freshness.

---

## Phase 6: User Story 4 - Dynamically Redistribute Percentages (Priority: P2)

**Goal**: Authorized members redistribute percentages; new expected contributions apply forward while history is preserved unchanged.

**Independent Test**: Redistribute mid-period; confirm new plan version applies forward and prior-period expected amounts and records are unchanged.

- [ ] T061 [P] [US4] Write failing unit tests for **plan versioning** (redistribution creates new version, prior snapshots immutable — FR-016, SC-006) in `apps/api/test/unit/plan-versioning.spec.ts`
- [ ] T062 [US4] Implement plan-versioning logic (new `ContributionPlan.version`, `effectiveFromPeriodId`, never mutate closed periods) in `apps/api/src/modules/contributions/domain/redistribution.ts`
- [ ] T063 [US4] Implement `redistribute` use case (re-applies cross-profile cap + range validation) emitting `PercentageRedistributed` in `apps/api/src/modules/contributions/application/`
- [ ] T064 [US4] Implement GraphQL resolver `redistribute` returning new `ContributionPlan` in `apps/api/src/modules/contributions/interface/`
- [ ] T065 [US4] Invalidate standing/pool caches on `PercentageRedistributed` (forward only) in `apps/api/src/modules/contributions/infrastructure/cache/`
- [ ] T066 [P] [US4] Write failing integration test: prior-period expected amounts + records unchanged after redistribution (SC-006) in `apps/api/test/integration/us4-history.spec.ts`
- [ ] T067 [US4] Wire audit entries for redistribution events in `apps/api/src/modules/contributions/application/`
- [ ] T068 [P] [US4] Implement Flutter redistribution UI (edit percentages, effective-period note) in `apps/mobile/lib/features/contributions/redistribution/`

**Checkpoint**: Redistribution works forward-only with provably preserved history.

---

## Phase 7: User Story 5 - Manage Shared Financial Elements (Priority: P2)

**Goal**: Create/manage shared goals, debts, credit cards, investments, and budgets funded from the pool; enforce overpayment rejection and debt-responsibility rules.

**Independent Test**: Create a goal and a debt, fund/pay from the pool with exact balance changes, confirm overpayment is rejected, and confirm debt responsibilities default to contribution % and sum to 100%.

- [ ] T069 [P] [US5] Write failing unit tests for **overpayment rejection** (payment ≤ outstanding; balance never < 0 — FR-020b, FR-024) in `apps/api/test/unit/overpayment.spec.ts`
- [ ] T070 [P] [US5] Write failing unit tests for **debt-responsibility rules** (default to contribution %, overridable, sum to 100%, proportional reassign on leave — FR-020a) in `apps/api/test/unit/debt-responsibility.spec.ts`
- [ ] T071 [P] [US5] Implement `SharedGoal` entity + funding logic (exact amount — FR-020) in `apps/api/src/modules/shared-elements/domain/goal.ts`
- [ ] T072 [P] [US5] Implement `SharedDebt`/`SharedCreditCard` entity + payment logic with overpayment rejection in `apps/api/src/modules/shared-elements/domain/debt.ts`
- [ ] T073 [P] [US5] Implement `DebtResponsibility` + proportional reassignment-on-leave (uses largest-remainder allocator) in `apps/api/src/modules/shared-elements/domain/debt-responsibility.ts`
- [ ] T074 [P] [US5] Implement `SharedInvestment` and `SharedBudget` entities (budget remaining = limit − spent — FR-018) in `apps/api/src/modules/shared-elements/domain/`
- [ ] T075 [US5] Implement Prisma repositories for all shared elements (tenant-scoped) in `apps/api/src/modules/shared-elements/infrastructure/`
- [ ] T076 [US5] Implement application use cases: createSharedGoal, fundGoal, paySharedDebt, setDebtResponsibility, create/record budget spend, manage investment value in `apps/api/src/modules/shared-elements/application/`
- [ ] T077 [US5] Hook `MemberLeft` consumer to reassign debt responsibilities proportionally (FR-020a) in `apps/api/src/modules/shared-elements/application/`
- [ ] T078 [US5] Emit events (GoalFunded, SharedDebtPaid, DebtResponsibilitySet) via outbox in `apps/api/src/modules/shared-elements/application/`
- [ ] T079 [US5] Implement GraphQL resolvers + inputs for goals/debts/credit cards/investments/budgets, scoped by permission (Viewer read-only) in `apps/api/src/modules/shared-elements/interface/`
- [ ] T080 [P] [US5] Write failing integration test: overpayment rejected, balance unchanged (FR-020b) in `apps/api/test/integration/us5-overpayment.spec.ts`
- [ ] T081 [P] [US5] Write failing integration test: shortfall does NOT block goal funding / debt payment (FR-019) in `apps/api/test/integration/us5-shortfall-nonblocking.spec.ts`
- [ ] T082 [P] [US5] Write failing integration test: debt responsibilities reassign proportionally and still sum to 100% after a member leaves (FR-020a) in `apps/api/test/integration/us5-reassign.spec.ts`
- [ ] T083 [P] [US5] Implement Flutter shared-elements UI (goals, debts, credit cards, investments, budgets) in `apps/mobile/lib/features/shared_elements/`
- [ ] T084 [US5] Add GraphQL contract tests for shared-element operations in `apps/api/test/contract/schema.spec.ts`
- [ ] T085 [US5] Wire audit entries for shared-element financially significant mutations (FR-007/Architectural Constraints) in `apps/api/src/modules/shared-elements/application/`

**Checkpoint**: Shared elements are fully manageable with enforced money-integrity rules.

---

## Phase 8: User Story 6 - Maintain Isolated Personal Accounts (Priority: P3)

**Goal**: Users hold personal accounts (all types) isolated from shared profiles; contributing moves only the contributed amount.

**Independent Test**: Create personal accounts; confirm they are invisible to other members and excluded from pool calculations; contribute from one and confirm only the contributed amount enters the pool.

- [ ] T086 [P] [US6] Implement `Account` entity with single-profile ownership (PERSONAL|SHARED, exactly one profile — FR-010a) and all account types in `apps/api/src/modules/accounts/domain/account.ts`
- [ ] T087 [US6] Implement Prisma repository + use cases for personal accounts (create/list, tenant + user scoped) in `apps/api/src/modules/accounts/`
- [ ] T088 [US6] Implement GraphQL resolvers exposing `PersonalProfile.accounts` only to the owning user; ensure exclusion from shared pool calculations (FR-010) in `apps/api/src/modules/accounts/interface/`
- [ ] T089 [US6] Implement contribute-from-account flow so only the contributed amount enters the pool, not the account balance (FR-010) in `apps/api/src/modules/accounts/application/`
- [ ] T090 [P] [US6] Write failing integration test: personal account invisible to other members and excluded from pool (FR-004, FR-010a) in `apps/api/test/integration/us6-personal-isolation.spec.ts`
- [ ] T091 [P] [US6] Implement Flutter personal-accounts UI in `apps/mobile/lib/features/accounts/`

**Checkpoint**: Personal accounts coexist with shared participation under full isolation.

---

## Phase 9: User Story 7 - AI Financial Coaching Readiness (Priority: P3)

**Goal**: Expose a permission-scoped, read-only coaching surface via OpenRouter that can never mutate financial state.

**Independent Test**: Request coaching insights; confirm data is permission-scoped, no state change occurs, and applying a suggestion requires a normal validated mutation.

- [ ] T092 [P] [US7] Implement read-only coaching read-model projection (assembled from reusable analytics service; no write collaborators injected — Principle III, R9) in `apps/api/src/modules/ai-coaching/domain/`
- [ ] T093 [US7] Implement OpenRouter client with permission-scoped, redacted prompt assembly (define included fields) in `apps/api/src/modules/ai-coaching/infrastructure/openrouter.client.ts`
- [ ] T094 [US7] Implement `coachingInsights` query returning `CoachingInsight`/`CoachingSuggestion` (advisory only; `suggestedMutation` is a hint) in `apps/api/src/modules/ai-coaching/interface/`
- [ ] T095 [US7] Implement graceful degradation for OpenRouter timeout/unavailability (coaching returns a defined fallback) in `apps/api/src/modules/ai-coaching/infrastructure/`
- [ ] T096 [US7] Subscribe a READ-ONLY projection consumer to `ContributionRecorded`/`PercentageRedistributed` to refresh the coaching read model (no commands emitted) in `apps/api/src/modules/ai-coaching/application/`
- [ ] T097 [P] [US7] Write failing integration test: coaching path produces 0 state changes (no outbox/audit writes) — SC-008 in `apps/api/test/integration/us7-ai-readonly.spec.ts`
- [ ] T098 [P] [US7] Write failing integration test: coaching data respects requester permission scope (FR-022) in `apps/api/test/integration/us7-ai-scope.spec.ts`
- [ ] T099 [P] [US7] Implement Flutter coaching UI (insights + suggestions; applying routes through normal mutations) in `apps/mobile/lib/features/coaching/`

**Checkpoint**: AI coaching is available and structurally incapable of mutating financial state.

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Hardening and cross-story quality (addresses lower-priority gate items)

- [ ] T100 [P] Add cursor pagination to unbounded GraphQL list fields (members, contribution records, goals) in `apps/api/src/common/graphql/pagination.ts` (design-gate CHK017)
- [ ] T101 [P] Define and document the domain error taxonomy + GraphQL error codes in `apps/api/src/common/errors/catalog.ts` (design-gate CHK016)
- [ ] T102 [P] Add rate limiting for mutations and OpenRouter calls in `apps/api/src/common/throttling/` (design-gate CHK027)
- [ ] T103 [P] Add metrics + tracing (OpenTelemetry) and structured-log fields in `apps/api/src/common/observability/` (design-gate CHK004)
- [ ] T104 [P] Add currency-mismatch rejection guard (single currency per profile) in `apps/api/src/modules/shared-elements/domain/` (design-gate CHK041)
- [ ] T105 Run `quickstart.md` end-to-end validation scenarios and record results in `specs/001-shared-financial-profiles/quickstart.md`
- [ ] T106 [P] Verify SDL export matches `packages/contracts/schema.graphql` and run full contract suite (`pnpm test:contract`)
- [ ] T107 [P] Add property-based tests for largest-remainder allocator and reconciliation invariants in `apps/api/test/unit/property/`
- [ ] T108 Update `CLAUDE.md` and module READMEs with finalized module map and run `pnpm test` (all suites green)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup — **BLOCKS all user stories**.
- **User Stories (Phases 3–9)**: All depend on Foundational. Priority order P1 → P2 → P3.
- **Polish (Phase 10)**: Depends on the targeted user stories being complete.

### User Story Dependencies

- **US1 (P1)**: Depends only on Foundational. Foundation for membership/permissions used by others.
- **US2 (P1)**: Depends on Foundational; uses US1 memberships (run after US1 or coordinate on Membership).
- **US3 (P2)**: Depends on US2 (allocations/expected amounts).
- **US4 (P2)**: Depends on US2/US3 (plans + periods to version and preserve).
- **US5 (P2)**: Depends on US1 (permissions) + US2 (pool); `MemberLeft` reassignment depends on US1.
- **US6 (P3)**: Depends on Foundational + US1 (profiles); largely independent of contribution stories.
- **US7 (P3)**: Depends on the analytics service (Foundational) + US2/US3 data; read-only.

### Within Each User Story

- Calculation unit tests (constitution) written and FAILING before implementation.
- Domain entities/services → repositories → application use cases → events → GraphQL resolvers → mobile UI.
- Story complete and independently testable before moving to next priority.

### Parallel Opportunities

- All `[P]` Setup tasks (T003–T008) run together.
- Foundational `[P]` tasks (T013, T021, T024, T025, T027, T028) run together once their non-`[P]` prerequisites land.
- Within a story, `[P]` domain/test/mobile tasks on different files run together (e.g., US5 T069–T074, T080–T083).
- After Foundational, P3 stories US6 and US7 can be staffed in parallel with later P2 work.

---

## Parallel Example: User Story 5

```bash
# Failing unit tests first (different files, parallel):
Task: "T069 overpayment rejection tests in apps/api/test/unit/overpayment.spec.ts"
Task: "T070 debt-responsibility tests in apps/api/test/unit/debt-responsibility.spec.ts"

# Then domain entities (different files, parallel):
Task: "T071 SharedGoal in apps/api/src/modules/shared-elements/domain/goal.ts"
Task: "T072 SharedDebt in apps/api/src/modules/shared-elements/domain/debt.ts"
Task: "T073 DebtResponsibility in apps/api/src/modules/shared-elements/domain/debt-responsibility.ts"
Task: "T074 Investment + Budget in apps/api/src/modules/shared-elements/domain/"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Complete Phase 1 (Setup) + Phase 2 (Foundational).
2. Complete Phase 3 (US1).
3. **STOP and VALIDATE**: create/govern a shared profile with isolated permissions, ownership transfer, and personal isolation — independently demoable.

### Incremental Delivery

1. Setup + Foundational → foundation ready.
2. + US1 (govern) → MVP.
3. + US2 (allocate) → contributions plan.
4. + US3 (track) → accountability.
5. + US4 (redistribute) → adaptability with preserved history.
6. + US5 (shared elements) → tangible outcomes.
7. + US6 (personal isolation) and US7 (AI readiness) → completeness.

Each increment is independently testable and adds value without breaking prior stories.
