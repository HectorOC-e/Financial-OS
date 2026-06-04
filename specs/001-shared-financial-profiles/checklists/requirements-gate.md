# Requirements Quality Gate Checklist: Shared Financial Profiles

**Purpose**: Formal pre-plan gate validating the *quality* of the requirements (completeness, clarity,
consistency, measurability, coverage) before `/speckit-plan`. These items test whether requirements are
well-written — NOT whether any implementation behaves correctly.
**Created**: 2026-06-04
**Feature**: [spec.md](../spec.md)

## Requirement Completeness

- [x] CHK001 Are requirements defined for the invitation lifecycle (sending, accepting, declining, and expiry of an invite), not just the act of inviting? [Completeness, Gap, Spec §FR-002] — RESOLVED: accept/decline/14-day expiry (FR-002a).
- [x] CHK002 Is the source and update mechanism of a member's "declared income" specified, rather than deferred? [Completeness, Spec §FR-011, §Assumptions] — RESOLVED: self-declared per profile, updatable (FR-011).
- [x] CHK003 Are contribution-period requirements (length, start/end boundaries, rollover, default cycle) fully specified? [Completeness, Spec §Assumptions] — RESOLVED: auto-rollover, configurable, monthly default (FR-016a).
- [ ] CHK004 Are per-account-type behavior requirements defined (wallet vs general account vs investment account vs emergency fund vs credit card vs debt account), beyond merely listing the types? [Completeness, Spec §FR-008]
- [x] CHK005 Are requirements defined for profile dissolution / what happens to pooled funds and shared elements when the last member or the owner exits? [Completeness, Gap, Spec §FR-007a] — RESOLVED: sole owner archives/soft-closes, read-only, no hard delete (FR-007c).
- [ ] CHK006 Are notification/alerting requirements defined for shortfalls and rejected over-100% allocations? [Completeness, Gap, Spec §FR-015a, §FR-019]
- [ ] CHK007 Are requirements defined for refund/negative/correcting transactions against shared goals, debts, and credit cards? [Completeness, Gap, Spec §FR-020]
- [ ] CHK008 Are currency and rounding rules specified concretely (rounding direction, residual allocation) rather than only "no precision loss"? [Completeness, Spec §FR-024, §Edge Cases]

## Requirement Clarity

- [x] CHK009 Is "declared income" qualified with basis and frequency (gross vs net, per-period vs annual)? [Clarity, Spec §FR-011] — RESOLVED: per-period, member-declared amount (FR-011).
- [ ] CHK010 Is "available pooled funds" defined precisely enough to determine what shared spending may draw against? [Clarity, Spec §FR-019]
- [ ] CHK011 Are the thresholds for contribution standing ("on track", "ahead", "behind") quantified or formula-defined? [Clarity, Spec §FR-017]
- [ ] CHK012 Is "explicitly contributes or shares" defined so it is unambiguous when personal data becomes visible in a shared profile? [Clarity, Spec §FR-010, §US1]
- [x] CHK013 Is the effective-period boundary of a redistribution (when "future" begins relative to the current period) explicitly defined? [Clarity, Ambiguity, Spec §FR-016] — RESOLVED: changes apply to next period; current snapshot immutable (FR-016a).
- [x] CHK014 Is the immutability scope of "historical contribution records" defined (which fields are frozen, which may annotate)? [Clarity, Spec §FR-016, §SC-006] — RESOLVED: closed periods never recomputed; current snapshot immutable (FR-016a).
- [ ] CHK015 Is the mechanism/source for recording "shared spending" against a shared budget specified? [Clarity, Spec §FR-018]

## Requirement Consistency

- [ ] CHK016 Do the per-profile 0–100% range (FR-013) and the cross-profile 100% cap (FR-015a) align without conflicting interpretations? [Consistency, Spec §FR-013, §FR-015a]
- [ ] CHK017 Is debt responsibility percentage summing to 100% (FR-020a) consistent with the "emergent, not fixed" contribution model (FR-015)? [Consistency, Spec §FR-015, §FR-020a]
- [ ] CHK018 Are the role capabilities in FR-005 consistent with the actions implied across user-story scenarios (e.g., who may create goals, record spending, redistribute)? [Consistency, Spec §FR-005, §US4, §US5]
- [ ] CHK019 Is the "pool is emergent" statement consistent with edge-case references to the profile's "planned obligations"? [Consistency, Spec §FR-015, §Edge Cases]
- [ ] CHK020 Is the single-owner model (FR-005, Shared Profile entity) consistent everywhere ownership/governance is referenced? [Consistency, Spec §FR-005, §Key Entities]

## Acceptance Criteria Quality (Measurability)

- [ ] CHK021 Does SC-001's "under 3 minutes" define the precise start and end conditions so it is objectively measurable? [Measurability, Spec §SC-001]
- [ ] CHK022 Are SC-002 and SC-005 ("100%"/"zero variance") tied to the defined rounding rules so they are verifiable rather than aspirational? [Measurability, Spec §SC-002, §SC-005, §FR-024]
- [x] CHK023 Is SC-007's "at any time" bounded by any freshness/latency expectation to be testable? [Measurability, Spec §SC-007] — RESOLVED: ≤5-second freshness bound (SC-007).
- [ ] CHK024 Is every functional requirement traceable to at least one success criterion, and vice versa? [Traceability, Spec §Requirements, §Success Criteria]

## Scenario Coverage

- [x] CHK025 Are alternate-flow requirements specified for invitation decline and invite expiry? [Coverage, Alternate Flow, Gap, Spec §FR-002] — RESOLVED: decline + 14-day expiry (FR-002a).
- [ ] CHK026 Are exception-flow requirements (including user-facing messaging) fully specified for rejected over-100% allocations? [Coverage, Exception Flow, Spec §FR-015a]
- [ ] CHK027 Are recovery requirements defined for a member rejoining a profile after leaving (treatment of prior records)? [Coverage, Recovery, Gap, Spec §FR-007a]
- [x] CHK028 Are concurrent-edit conflict-resolution requirements defined, given the edge case is raised but no requirement exists? [Coverage, Gap, Spec §Edge Cases] — RESOLVED: optimistic concurrency, version conflict error (FR-006a).

## Edge Case Coverage

- [x] CHK029 Is the overpayment behavior for shared debt/credit card resolved to a single rule rather than left as "rejected or recorded as credit per defined rule"? [Edge Case, Ambiguity, Spec §Edge Cases] — RESOLVED: reject overpayment (FR-020b).
- [x] CHK030 Are requirements defined for when a member's declared income changes mid-period (retroactive vs forward-only effect)? [Edge Case, Gap, Spec §FR-016] — RESOLVED: forward-only (next period); current snapshot immutable (FR-016a).
- [ ] CHK031 Is the zero-income / nonzero-percentage case fully specified beyond "expected contribution = 0"? [Edge Case, Spec §Edge Cases]
- [ ] CHK032 Are residual/remainder handling requirements defined when a pooled total cannot divide evenly across members or responsibilities? [Edge Case, Gap, Spec §FR-024]

## Permissions & Isolation Requirements

- [ ] CHK033 Are exact action-to-role mappings enumerated for every write operation, rather than described at a high level? [Completeness, Spec §FR-005]
- [ ] CHK034 Are requirements defined for which roles can view which shared elements (the scope of "permitted to see" for Viewers)? [Clarity, Spec §FR-005, §FR-009]
- [ ] CHK035 Are audit-entry content and retention requirements specified for all financially significant changes, not only membership/permission changes? [Coverage, Spec §FR-007, §FR-021]
- [ ] CHK036 Is cross-profile permission isolation stated as a testable requirement rather than only an assumption? [Measurability, Spec §Assumptions, §FR-005]

## Lifecycle & State Transition Requirements

- [x] CHK037 Are ownership-transfer requirements specified (eligibility, acceptance by the new owner, effective timing)? [Gap, Spec §FR-007a] — RESOLVED: nominate-and-accept flow (FR-007b).
- [x] CHK038 Is "released/reassigned" for unmet debt responsibility shares on member departure disambiguated to a single defined behavior? [Ambiguity, Spec §FR-007a] — RESOLVED: proportional reassign (FR-020a).
- [x] CHK039 Are membership state transitions (invited → active → left, and ownership held → transferred) enumerated as requirements? [Gap, Spec §FR-002, §FR-007a] — RESOLVED: INVITED→ACTIVE|DECLINED|EXPIRED→LEFT (FR-002a) + transfer (FR-007b).

## Dependencies & Assumptions

- [ ] CHK040 Is the dependency on existing authentication/identity documented with the specific capabilities/contract it must provide? [Dependency, Spec §Dependencies]
- [ ] CHK041 Is the single-currency-per-profile assumption explicitly bounded, with enforcement (rejection of mixed-currency input) specified? [Assumption, Spec §Assumptions]
- [x] CHK042 Is the deferral of the income-source mechanism flagged as a planning risk with an owner/decision point? [Assumption, Spec §Assumptions] — RESOLVED: no longer deferred; self-declared per profile (FR-011).

## Notes

- This is a requirements-quality gate, not a test plan. Each unchecked item indicates a requirement to
  sharpen, complete, or disambiguate in `spec.md` before `/speckit-plan`.
- Recommended action for unresolved items: update the spec (or run `/speckit-clarify` again) and re-check.
- Resolved via clarification sessions (2026-06-04): CHK001, CHK002, CHK003, CHK005, CHK009, CHK013,
  CHK014, CHK023, CHK025, CHK028, CHK029, CHK030, CHK037, CHK038, CHK039, CHK042.
- Remaining open items are lower-impact hardening/quality concerns (e.g., CHK004 per-account-type
  behavior, CHK006 notifications, CHK007 refunds, CHK010/CHK011/CHK012/CHK015 clarity, CHK016–CHK020
  consistency audits, CHK021/CHK022/CHK024 measurability/traceability, CHK026/CHK027 coverage,
  CHK031/CHK032 edge cases, CHK033–CHK036 permission detail, CHK040/CHK041 deps) — resolve as needed or
  consciously defer to planning/polish.
