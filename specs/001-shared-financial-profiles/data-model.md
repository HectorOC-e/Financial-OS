# Phase 1 Data Model: Shared Financial Profiles

All monetary fields are **integer minor units (cents)**; percentages are **basis points (0–10000)**.
Every tenant-scoped table carries a non-null `tenantId` and is protected by PostgreSQL RLS. All IDs are
UUID v7. Timestamps are UTC. "Append-only" tables forbid UPDATE/DELETE at the domain layer.

## Entity Overview

```text
Tenant 1──* User
User 1──1 PersonalProfile
User *──* SharedProfile  (via Membership)
SharedProfile 1──* Membership ──1 User
SharedProfile 1──* SharedElement (Goal | Debt | CreditCard | Investment | Budget)
Profile (Personal|Shared) 1──* Account
SharedProfile 1──* ContributionPlan (versioned) 1──* ContributionAllocation ──1 Membership
SharedProfile 1──* ContributionPeriod 1──* ContributionRecord ──1 Membership
SharedDebt/SharedCreditCard 1──* DebtResponsibility ──1 Membership
SharedProfile 1──* AuditEntry
* ──* OutboxEvent (per aggregate)
```

---

## Core Entities

### Tenant
SaaS isolation boundary.
- `id`, `name`, `settings` (JSON: default period length, base currency), `createdAt`.
- **Rules**: every other entity references exactly one tenant; cross-tenant references forbidden (RLS).

### User
- `id`, `tenantId`, `authSubject` (external identity ref), `displayName`, `createdAt`.
- **Rules**: identity/auth is external (assumption). One personal profile per user.

### PersonalProfile
- `id`, `tenantId`, `userId` (unique), `createdAt`.
- **Rules**: private by default; never visible to other users (FR-001, FR-004).

### SharedProfile
- `id`, `tenantId`, `name`, `ownerMembershipId`, `baseCurrency`, `periodLength` (enum, default MONTHLY),
  `createdAt`.
- **Rules**: exactly one owner at a time (FR-005); ownership transferable (FR-007a); `baseCurrency`
  single per profile (assumption — mixed-currency input rejected).

### Membership
Association of a User to a SharedProfile.
- `id`, `tenantId`, `sharedProfileId`, `userId`, `role` (enum: OWNER | ADMIN | CONTRIBUTOR | VIEWER),
  `status` (enum: INVITED | ACTIVE | LEFT), `invitedAt`, `joinedAt`, `leftAt`.
- **Rules**: role drives capability matrix (FR-005/FR-006). Exactly one OWNER membership per profile.
  A non-owner may transition ACTIVE→LEFT anytime; OWNER must transfer ownership before leaving (FR-007a).
  State machine: `INVITED → ACTIVE → LEFT` (and `INVITED → (declined/expired) → removed`).

### Account
A financial holding; belongs to exactly one profile (FR-010a).
- `id`, `tenantId`, `profileType` (PERSONAL | SHARED), `profileId`, `type` (enum: WALLET | ACCOUNT |
  INVESTMENT | EMERGENCY_FUND | CREDIT_CARD | DEBT), `name`, `balance` (cents, NUMERIC storage),
  `currency`, `createdAt`.
- **Rules**: never linked to multiple profiles (FR-010a). Personal accounts excluded from shared pool
  calculations unless explicitly contributed (FR-010). CREDIT_CARD/DEBT balances MUST NOT go below zero
  via normal operations (FR-024).

---

## Contribution Domain

### ContributionPlan (versioned)
The set of member percentage allocations for a profile, effective from a period forward.
- `id`, `tenantId`, `sharedProfileId`, `version` (int, incrementing), `effectiveFromPeriodId`, `createdBy`,
  `createdAt`.
- **Rules**: redistribution creates a NEW version (never mutates prior) (FR-016, SC-006).

### ContributionAllocation
A single member's percentage within a plan version.
- `id`, `tenantId`, `contributionPlanId`, `membershipId`, `percentageBp` (0–10000).
- **Rules**: 0–100% per profile (FR-013). Cross-profile sum for a member ≤ 100% enforced at command time
  (FR-015a). Pool is emergent = Σ expected amounts (FR-015).

### ContributionPeriod
A recurring window (default monthly, configurable).
- `id`, `tenantId`, `sharedProfileId`, `startDate`, `endDate`, `status` (OPEN | CLOSED),
  `planVersionSnapshot` (the plan version applied), `createdAt`.
- **Rules**: expected amounts are snapshotted when the period opens (R7); closed periods are immutable.

### ContributionRecord (append-only)
An actual contribution by a member in a period.
- `id`, `tenantId`, `sharedProfileId`, `periodId`, `membershipId`, `amount` (cents), `recordedAt`,
  `sourceAccountId?` (optional personal account contributed from).
- **Rules**: append-only; standing = actual vs snapshotted expected (FR-017). Σ records reconciles exactly
  with pooled total (SC-005, FR-019). Unmet expected is tracked/reported, never blocks spending (FR-019).

---

## Shared Elements

### SharedGoal
- `id`, `tenantId`, `sharedProfileId`, `name`, `targetAmount` (cents), `fundedAmount` (cents), `status`,
  `createdAt`.
- **Rules**: funded from pool; `fundedAmount` adjusts by exact transacted amount (FR-020).

### SharedDebt / SharedCreditCard
- `id`, `tenantId`, `sharedProfileId`, `kind` (DEBT | CREDIT_CARD), `name`, `outstandingBalance` (cents),
  `createdAt`.
- **Rules**: payments reduce balance by exact amount (FR-020); balance not below zero (FR-024). Overpayment
  is **rejected** — a payment may not exceed the outstanding balance (FR-020b, confirmed).

### DebtResponsibility
Per-member responsibility share of a shared debt/credit card (FR-020a).
- `id`, `tenantId`, `sharedDebtId`, `membershipId`, `percentageBp`.
- **Rules**: defaults to the member's contribution percentage; overridable by permitted roles; the set for
  one debt MUST sum to 100% (10000 bp). On member leave, the departing member's share is **reassigned
  proportionally** to remaining members in proportion to their existing shares (FR-020a, confirmed).

### SharedInvestment
- `id`, `tenantId`, `sharedProfileId`, `name`, `currentValue` (cents), `valueAsOf`, `createdAt`.
- **Rules**: visible per permission level; no exposure of members' personal holdings (FR-009, US5).

### SharedBudget
- `id`, `tenantId`, `sharedProfileId`, `category`, `limit` (cents), `spent` (cents), `periodId`,
  `createdAt`.
- **Rules**: remaining = limit − spent, reflected exactly as spending recorded (FR-018).

---

## Governance & Infrastructure

### AuditEntry (append-only, immutable)
- `id`, `tenantId`, `sharedProfileId?`, `actorMembershipId`, `action`, `beforeValue` (JSON), `afterValue`
  (JSON), `occurredAt`.
- **Rules**: written for every membership/permission change (FR-007) and every financially significant
  mutation; immutable (Architectural Constraints).

### OutboxEvent (append-only)
- `id`, `tenantId`, `aggregateType`, `aggregateId`, `eventType`, `schemaVersion`, `payload` (JSON),
  `occurredAt`, `dispatchedAt?`.
- **Rules**: written in the same transaction as the state change (R4); relayed once, replayable.

---

## Value Objects (domain, not tables)

- **Money**: `{ amount: int (cents), currency }` — arithmetic only between same currency; deterministic
  rounding with explicit remainder allocation.
- **Percentage**: basis points 0–10000; conversions to Money are pure functions.
- **ContributionStanding**: derived `{ expected, actual, variance, state: ON_TRACK | AHEAD | BEHIND }`.

## Key Validation Rules (traceability)

| Rule | Source |
|------|--------|
| Account belongs to exactly one profile | FR-010a |
| Per-profile allocation 0–100% | FR-013 |
| Cross-profile committed ≤ 100% | FR-015a |
| Pool = Σ contributions (emergent) | FR-015 |
| Redistribution preserves history | FR-016, SC-006 |
| Σ records reconciles to total | FR-019, SC-005 |
| Shortfall tracked, never blocks | FR-019 |
| Debt responsibilities sum to 100% | FR-020a |
| Balances never below zero | FR-024 |
| One owner; transfer before leave | FR-005, FR-007a |
| Audit on membership/permission change | FR-007 |
| AI never writes financial state | FR-023, SC-008 |

## Carried items — RESOLVED via clarification (2026-06-04)

- **CHK029/CHK042** — overpayment rule → **reject** overpayments (FR-020b).
- **CHK037/CHK043** — ownership-transfer mechanics → **nominate-and-accept**; current owner retains
  ownership until the nominated ACTIVE member accepts; both steps audited (FR-007b).
- **CHK038/CHK044** — departed-member debt responsibility → **reassign proportionally** to remaining
  members (FR-020a).
- **CHK009** — residual-unit allocation → **largest-remainder method**, ties by stable membership ID
  (FR-024a).
- **CHK028** — standing freshness → **≤5 seconds** via event-driven invalidation (SC-007).
