# Design Quality Gate Checklist: Shared Financial Profiles

**Purpose**: Formal pre-`/speckit-tasks` gate validating the *quality* of the design requirements in
`plan.md`, `data-model.md`, and `contracts/` (completeness, clarity, consistency, measurability, coverage).
Tests whether the design is well-specified — NOT whether code works.
**Created**: 2026-06-04
**Feature**: [spec.md](../spec.md) · [plan.md](../plan.md) · [data-model.md](../data-model.md) · [schema.graphql](../contracts/schema.graphql) · [events.md](../contracts/events.md)

## Architecture & Design Completeness

- [x] CHK001 Are the responsibilities of every backend module/bounded context enumerated, not just listed by name? [Completeness, Plan §Project Structure] — ACCEPTED: Plan §Project Structure enumerates per-module responsibilities; finalized module map recorded in T116.
- [x] CHK002 Are inter-module dependency rules specified (which layers/modules may depend on which) to protect the pure domain layer? [Gap, Plan §Structure Decision] — ACCEPTED: domain/application/infrastructure/interface layering in Plan §Structure Decision; domain kept framework/I/O-free (Principle IV).
- [x] CHK003 Is the horizontal scaling topology of the modular monolith specified as a requirement (statelessness, session/tenant context handling)? [Completeness, Plan §Technical Context] — ACCEPTED: Plan specifies stateless Linux containers behind a load balancer; per-request tenant context (T017/T029); quantification DEFERRED to T110.
- [x] CHK004 Are observability requirements (metrics, tracing signals, log fields) defined beyond "structured logging"? [Gap, Plan §Primary Dependencies] — DEFERRED to T110 (OpenTelemetry metrics + tracing + structured-log fields).
- [x] CHK005 Are schema migration and rollback requirements defined, given migrations must contain no business logic? [Gap, Plan §Constitution Check] — DEFERRED to T015 (schema-only migration); constitution forbids business logic in migrations.
- [x] CHK006 Are outbox dispatcher failure modes (retry, poison-event, dead-letter) specified as requirements? [Gap, Contracts events.md] — DEFERRED to T022 (dispatcher with idempotency keys, BullMQ retry/DLQ).
- [x] CHK007 Is the action→role capability matrix referenced by the plan actually defined somewhere concrete? [Gap, Plan §R5/Research §R5] — DEFERRED to T025 (explicit action→role capability matrix).

## Architecture Clarity

- [x] CHK008 Is "horizontally scalable / 10k concurrent users" quantified with target instance counts or throughput per instance? [Clarity, Plan §Performance Goals] — DEFERRED to T110 (observability establishes per-instance throughput baselines).
- [x] CHK009 Is the rounding and remainder-allocation rule defined precisely enough to be deterministic (e.g., exactly which member receives the residual cent)? [Ambiguity, Research §R1] — RESOLVED: largest-remainder method (FR-024a).
- [x] CHK010 Are the boundaries between `domain`, `application`, `infrastructure`, and `interface` layers defined with explicit allowed contents? [Clarity, Plan §Project Structure] — ACCEPTED: Plan §Project Structure annotates allowed contents per layer (e.g., domain = pure entities/VOs/services, NO I/O).
- [x] CHK011 Is "AI-ready" defined with concrete requirements (read model shape, access surface) rather than as an adjective? [Clarity, Plan §Summary] — DEFERRED to T099–T101 (read-only coaching read-model + `coachingInsights` query surface).

## Architecture / Constitution Consistency

- [x] CHK012 Does every state-changing GraphQL mutation have a corresponding documented domain event (e.g., goal creation, budget spend)? [Consistency, Contracts schema.graphql vs events.md] — DEFERRED to T037/T085 (event emission) verified by contract tests T046/T091.
- [x] CHK013 Are all data-model validation rules represented either as schema constraints or explicitly marked server-side-only? [Consistency, Data-Model §Key Validation Rules] — DEFERRED to T013/T108 (Result/error types + error catalog); server-side validation authoritative (Principle VIII).
- [x] CHK014 Is the single-owner rule consistently expressed across plan, data-model (Membership), and schema? [Consistency, Data-Model §Membership, Spec §FR-005] — ACCEPTED: single-OWNER invariant in data-model + FR-005; enforced/tested in T032/T033.
- [x] CHK015 Is the "pool is emergent" model consistent with the cached `poolTotal` derivation and its invalidation events? [Consistency, Plan §R8, Contracts events.md] — DEFERRED to T060 (reconciliation: pool == Σ records) + T062 (event-driven invalidation).

## API & Data Contract Quality

- [x] CHK016 Are domain error/failure response requirements (taxonomy, mapping to GraphQL errors) specified for mutations? [Gap, Contracts schema.graphql] — DEFERRED to T108 (error taxonomy + GraphQL error codes incl. CONFLICT/FORBIDDEN).
- [x] CHK017 Are pagination/limit requirements defined for unbounded list fields (members, contribution records, goals)? [Gap, Contracts schema.graphql] — DEFERRED to T107 (cursor pagination on unbounded list fields).
- [x] CHK018 Is the GraphQL schema versioning and deprecation policy documented as a requirement? [Clarity, Plan §R2] — ACCEPTED: Plan §R2 + Principle XI versioned GraphQL contract; SDL is source of truth (T005/T114).
- [x] CHK019 Are nullability and permission-scoping semantics defined for fields that vary by role (e.g., `standing`, `members`)? [Consistency, Contracts schema.graphql] — DEFERRED to T026/T038 (PermissionsGuard + resolver scoping).
- [x] CHK020 Is the `Money.amountCents` scalar's numeric range sufficient and specified (32-bit Int vs 64-bit) for maximum balances? [Ambiguity, Contracts schema.graphql] — RESOLVED: 64-bit `BigInt` scalar end-to-end (research R13).
- [x] CHK021 Are authorization/scoping requirements defined for GraphQL subscriptions? [Gap, Contracts schema.graphql §Subscription] — DEFERRED to T063 (authorization-scoped subscriptions).
- [x] CHK022 Is an ID/traceability scheme established linking schema operations and events back to FR/SC identifiers? [Traceability, Contracts] — ACCEPTED: tasks.md cites FR/SC IDs per operation; contract tests T046/T091 assert the linkage.

## Non-Functional Requirements

- [x] CHK023 Are performance targets differentiated by operation class (read query vs mutation vs subscription vs AI call)? [Completeness, Plan §Performance Goals] — DEFERRED to T110 (per-operation-class metrics; Plan already differentiates read p95 vs recompute budgets).
- [x] CHK024 Are per-profile scalability limits (max members, accounts, elements) stated as requirements rather than illustrative ranges? [Clarity, Plan §Scale/Scope] — DEFERRED to T110; current ~20-member/hundreds-of-elements ranges accepted as planning envelope.
- [x] CHK025 Are availability and recovery requirements (RTO/RPO, event replay window) defined? [Gap] — DEFERRED to T110/T021 (replayable outbox provides recovery basis); RTO/RPO targets accepted as ops-config concern.
- [x] CHK026 Are data-at-rest/in-transit protection and PII-handling requirements specified for financial data? [Gap] — DEFERRED to T112 (data-at-rest encryption / PII-handling configuration).
- [x] CHK027 Are rate-limiting/abuse-prevention requirements defined for mutations and OpenRouter calls? [Gap] — DEFERRED to T109 (rate limiting for mutations + OpenRouter calls).
- [x] CHK028 Are cache freshness requirements (30–60s TTL) reconciled with SC-007's "at any time" standing visibility? [Conflict, Plan §R8, Spec §SC-007] — RESOLVED: ≤5s freshness via event-driven invalidation (SC-007).
- [x] CHK029 Is cache-invalidation coverage specified for EVERY derived/cached value, not only the listed ones? [Coverage, Plan §R8, Contracts events.md] — DEFERRED to T062/T072 (event-driven invalidation for standings/pool on record + redistribute).

## AI Boundary & Determinism

- [x] CHK030 Are determinism constraints (no time/locale/random in financial math) expressed as testable requirements? [Measurability, Plan §Constraints] — DEFERRED to T009–T012 (test-first money/percentage suites) + T115 (property-based invariants).
- [x] CHK031 Is the read-only AI boundary expressed as a structural/enforceable requirement (no write collaborators injected) rather than convention? [Clarity, Research §R9] — DEFERRED to T099 (no write collaborators) verified by T104 (0 state changes).
- [x] CHK032 Are requirements defined for what data is included in AI prompts and any required redaction/permission scoping? [Gap, Research §R9] — DEFERRED to T100 (permission-scoped, redacted prompt assembly with defined included fields).
- [x] CHK033 Are AI failure/timeout/unavailability behaviors specified (graceful degradation of coaching)? [Gap] — DEFERRED to T102 (graceful degradation on OpenRouter timeout/unavailability).
- [x] CHK034 Is FR-021 cross-channel consistency backed by an explicit single-shared-analytics-service requirement? [Consistency, Plan §Constitution Check (X)] — DEFERRED to T030 (single analytics domain service seam) reused by T060/AI (Principle X).
- [x] CHK035 Are event schema evolution rules concretely defined (what counts as additive vs breaking)? [Clarity, Contracts events.md] — DEFERRED to T021 (versioned envelope `schemaVersion`); additive-vs-breaking policy recorded in contracts/events.md.

## Event-Driven & Multi-Tenancy

- [x] CHK036 Are tenant-context propagation requirements specified for async consumers off the request path (RLS GUC reset)? [Gap, Research §R3/R4] — DEFERRED to T017 (GUC setter) + T022 (tenant-context propagation through dispatcher).
- [x] CHK037 Are idempotency and replay-safety requirements specified for all event consumers (ordering, side-effect safety)? [Coverage, Contracts events.md] — DEFERRED to T023 (event registry/base consumer with `eventId` idempotency + replay safety).
- [x] CHK038 Is RLS policy coverage required for every tenant-scoped table as an explicit, verifiable requirement? [Coverage, Research §R3] — DEFERRED to T016 (RLS policies for every tenant-scoped table) verified by T018 (isolation test).

## Dependencies & Assumptions

- [x] CHK039 Is the external authentication/identity contract specified (what `authSubject` must provide)? [Assumption, Data-Model §User] — DEFERRED to T029 (GraphQL request context principal); `authSubject` contract finalized there.
- [x] CHK040 Are OpenRouter dependency requirements (model selection, cost ceiling, latency, fallback) documented? [Dependency, Gap] — DEFERRED to T100 (client/model selection) + T102 (latency/fallback) + T109 (cost/rate ceiling).
- [x] CHK041 Is the single-currency-per-profile constraint enforced in the contract (currency-mismatch rejection rule)? [Assumption, Data-Model §SharedProfile] — DEFERRED to T111 (currency-mismatch rejection guard).

## Ambiguities & Conflicts (carried forward)

- [x] CHK042 Is the overpayment rule (CHK029 from requirements-gate) confirmed rather than left as a data-model default? [Ambiguity, Data-Model §SharedDebt] — RESOLVED: reject (FR-020b).
- [x] CHK043 Is the ownership-transfer mechanics (eligibility, acceptance, timing) specified, not just required? [Ambiguity, Data-Model §Membership, Spec §FR-007a] — RESOLVED: nominate-and-accept (FR-007b).
- [x] CHK044 Is the departed-member debt responsibility behavior (release vs proportional reassign) confirmed? [Ambiguity, Data-Model §DebtResponsibility] — RESOLVED: proportional reassign (FR-020a).

## Notes

- This gate validates design-requirement quality before `/speckit-tasks`. Unchecked items indicate
  design requirements to sharpen in plan.md / data-model.md / contracts before task breakdown.
- Highest-risk open items for the author: CHK009 (rounding rule), CHK020 (money scalar range),
  CHK028 (cache TTL vs freshness), CHK032 (AI prompt data scope), CHK043/CHK044 (carried ambiguities).
- **Resolution (2026-06-04, Option A)**: Remaining items closed as RESOLVED (clarified), DEFERRED (tracked
  by a concrete Phase 2–10 task as annotated inline), or ACCEPTED (already satisfied by plan/data-model/
  contracts). No genuine design gap blocks Phase 2 foundational work. Deferred items must be re-verified
  against their referenced tasks before the Phase 10 polish checkpoint.
