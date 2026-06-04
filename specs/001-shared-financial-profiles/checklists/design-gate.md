# Design Quality Gate Checklist: Shared Financial Profiles

**Purpose**: Formal pre-`/speckit-tasks` gate validating the *quality* of the design requirements in
`plan.md`, `data-model.md`, and `contracts/` (completeness, clarity, consistency, measurability, coverage).
Tests whether the design is well-specified — NOT whether code works.
**Created**: 2026-06-04
**Feature**: [spec.md](../spec.md) · [plan.md](../plan.md) · [data-model.md](../data-model.md) · [schema.graphql](../contracts/schema.graphql) · [events.md](../contracts/events.md)

## Architecture & Design Completeness

- [ ] CHK001 Are the responsibilities of every backend module/bounded context enumerated, not just listed by name? [Completeness, Plan §Project Structure]
- [ ] CHK002 Are inter-module dependency rules specified (which layers/modules may depend on which) to protect the pure domain layer? [Gap, Plan §Structure Decision]
- [ ] CHK003 Is the horizontal scaling topology of the modular monolith specified as a requirement (statelessness, session/tenant context handling)? [Completeness, Plan §Technical Context]
- [ ] CHK004 Are observability requirements (metrics, tracing signals, log fields) defined beyond "structured logging"? [Gap, Plan §Primary Dependencies]
- [ ] CHK005 Are schema migration and rollback requirements defined, given migrations must contain no business logic? [Gap, Plan §Constitution Check]
- [ ] CHK006 Are outbox dispatcher failure modes (retry, poison-event, dead-letter) specified as requirements? [Gap, Contracts events.md]
- [ ] CHK007 Is the action→role capability matrix referenced by the plan actually defined somewhere concrete? [Gap, Plan §R5/Research §R5]

## Architecture Clarity

- [ ] CHK008 Is "horizontally scalable / 10k concurrent users" quantified with target instance counts or throughput per instance? [Clarity, Plan §Performance Goals]
- [x] CHK009 Is the rounding and remainder-allocation rule defined precisely enough to be deterministic (e.g., exactly which member receives the residual cent)? [Ambiguity, Research §R1] — RESOLVED: largest-remainder method (FR-024a).
- [ ] CHK010 Are the boundaries between `domain`, `application`, `infrastructure`, and `interface` layers defined with explicit allowed contents? [Clarity, Plan §Project Structure]
- [ ] CHK011 Is "AI-ready" defined with concrete requirements (read model shape, access surface) rather than as an adjective? [Clarity, Plan §Summary]

## Architecture / Constitution Consistency

- [ ] CHK012 Does every state-changing GraphQL mutation have a corresponding documented domain event (e.g., goal creation, budget spend)? [Consistency, Contracts schema.graphql vs events.md]
- [ ] CHK013 Are all data-model validation rules represented either as schema constraints or explicitly marked server-side-only? [Consistency, Data-Model §Key Validation Rules]
- [ ] CHK014 Is the single-owner rule consistently expressed across plan, data-model (Membership), and schema? [Consistency, Data-Model §Membership, Spec §FR-005]
- [ ] CHK015 Is the "pool is emergent" model consistent with the cached `poolTotal` derivation and its invalidation events? [Consistency, Plan §R8, Contracts events.md]

## API & Data Contract Quality

- [ ] CHK016 Are domain error/failure response requirements (taxonomy, mapping to GraphQL errors) specified for mutations? [Gap, Contracts schema.graphql]
- [ ] CHK017 Are pagination/limit requirements defined for unbounded list fields (members, contribution records, goals)? [Gap, Contracts schema.graphql]
- [ ] CHK018 Is the GraphQL schema versioning and deprecation policy documented as a requirement? [Clarity, Plan §R2]
- [ ] CHK019 Are nullability and permission-scoping semantics defined for fields that vary by role (e.g., `standing`, `members`)? [Consistency, Contracts schema.graphql]
- [ ] CHK020 Is the `Money.amountCents` scalar's numeric range sufficient and specified (32-bit Int vs 64-bit) for maximum balances? [Ambiguity, Contracts schema.graphql]
- [ ] CHK021 Are authorization/scoping requirements defined for GraphQL subscriptions? [Gap, Contracts schema.graphql §Subscription]
- [ ] CHK022 Is an ID/traceability scheme established linking schema operations and events back to FR/SC identifiers? [Traceability, Contracts]

## Non-Functional Requirements

- [ ] CHK023 Are performance targets differentiated by operation class (read query vs mutation vs subscription vs AI call)? [Completeness, Plan §Performance Goals]
- [ ] CHK024 Are per-profile scalability limits (max members, accounts, elements) stated as requirements rather than illustrative ranges? [Clarity, Plan §Scale/Scope]
- [ ] CHK025 Are availability and recovery requirements (RTO/RPO, event replay window) defined? [Gap]
- [ ] CHK026 Are data-at-rest/in-transit protection and PII-handling requirements specified for financial data? [Gap]
- [ ] CHK027 Are rate-limiting/abuse-prevention requirements defined for mutations and OpenRouter calls? [Gap]
- [x] CHK028 Are cache freshness requirements (30–60s TTL) reconciled with SC-007's "at any time" standing visibility? [Conflict, Plan §R8, Spec §SC-007] — RESOLVED: ≤5s freshness via event-driven invalidation (SC-007).
- [ ] CHK029 Is cache-invalidation coverage specified for EVERY derived/cached value, not only the listed ones? [Coverage, Plan §R8, Contracts events.md]

## AI Boundary & Determinism

- [ ] CHK030 Are determinism constraints (no time/locale/random in financial math) expressed as testable requirements? [Measurability, Plan §Constraints]
- [ ] CHK031 Is the read-only AI boundary expressed as a structural/enforceable requirement (no write collaborators injected) rather than convention? [Clarity, Research §R9]
- [ ] CHK032 Are requirements defined for what data is included in AI prompts and any required redaction/permission scoping? [Gap, Research §R9]
- [ ] CHK033 Are AI failure/timeout/unavailability behaviors specified (graceful degradation of coaching)? [Gap]
- [ ] CHK034 Is FR-021 cross-channel consistency backed by an explicit single-shared-analytics-service requirement? [Consistency, Plan §Constitution Check (X)]

## Event-Driven & Multi-Tenancy

- [ ] CHK035 Are event schema evolution rules concretely defined (what counts as additive vs breaking)? [Clarity, Contracts events.md]
- [ ] CHK036 Are tenant-context propagation requirements specified for async consumers off the request path (RLS GUC reset)? [Gap, Research §R3/R4]
- [ ] CHK037 Are idempotency and replay-safety requirements specified for all event consumers (ordering, side-effect safety)? [Coverage, Contracts events.md]
- [ ] CHK038 Is RLS policy coverage required for every tenant-scoped table as an explicit, verifiable requirement? [Coverage, Research §R3]

## Dependencies & Assumptions

- [ ] CHK039 Is the external authentication/identity contract specified (what `authSubject` must provide)? [Assumption, Data-Model §User]
- [ ] CHK040 Are OpenRouter dependency requirements (model selection, cost ceiling, latency, fallback) documented? [Dependency, Gap]
- [ ] CHK041 Is the single-currency-per-profile constraint enforced in the contract (currency-mismatch rejection rule)? [Assumption, Data-Model §SharedProfile]

## Ambiguities & Conflicts (carried forward)

- [x] CHK042 Is the overpayment rule (CHK029 from requirements-gate) confirmed rather than left as a data-model default? [Ambiguity, Data-Model §SharedDebt] — RESOLVED: reject (FR-020b).
- [x] CHK043 Is the ownership-transfer mechanics (eligibility, acceptance, timing) specified, not just required? [Ambiguity, Data-Model §Membership, Spec §FR-007a] — RESOLVED: nominate-and-accept (FR-007b).
- [x] CHK044 Is the departed-member debt responsibility behavior (release vs proportional reassign) confirmed? [Ambiguity, Data-Model §DebtResponsibility] — RESOLVED: proportional reassign (FR-020a).

## Notes

- This gate validates design-requirement quality before `/speckit-tasks`. Unchecked items indicate
  design requirements to sharpen in plan.md / data-model.md / contracts before task breakdown.
- Highest-risk open items for the author: CHK009 (rounding rule), CHK020 (money scalar range),
  CHK028 (cache TTL vs freshness), CHK032 (AI prompt data scope), CHK043/CHK044 (carried ambiguities).
