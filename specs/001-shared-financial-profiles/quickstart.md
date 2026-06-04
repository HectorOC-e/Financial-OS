# Quickstart & Validation Guide: Shared Financial Profiles

This guide proves the feature end-to-end. It references [data-model.md](./data-model.md) and
[contracts/schema.graphql](./contracts/schema.graphql) rather than duplicating them. Implementation
bodies (services, migrations, full tests) belong to `/speckit-tasks` and the implementation phase.

## Prerequisites

- Node.js 20 LTS, pnpm (or npm), Docker (for PostgreSQL 16 + Redis 7)
- Flutter 3.x (only for the mobile validation step)
- An OpenRouter API key in `OPENROUTER_API_KEY` (only for the AI coaching step)

## Setup

```bash
# From repo root
docker compose up -d postgres redis           # local Postgres 16 + Redis 7
cd apps/api
pnpm install
cp .env.example .env                           # set DATABASE_URL, REDIS_URL, OPENROUTER_API_KEY
pnpm prisma migrate dev                        # apply schema (schema only — no business logic)
pnpm start:dev                                 # GraphQL at http://localhost:3000/graphql
```

## Validation scenarios

Run these GraphQL operations (e.g., in the playground) in order. Each maps to a user story / requirement.

### 1. Create & govern a shared profile (US1, FR-002/FR-005/FR-007)
1. `createSharedProfile` → caller becomes OWNER; profile appears.
2. `inviteMember` (role CONTRIBUTOR) then `acceptInvitation` → member becomes ACTIVE.
3. As the VIEWER member, attempt `setAllocation` → **expect permission error, no state change** (SC-003).
4. Query another member's `me.personalProfile.accounts` from the shared context → **expect none visible**
   (SC-004).
5. `changeMemberRole` → confirm an `AuditEntry` is written (FR-007).

### 2. Percentage-based allocation (US2, FR-011/FR-013/FR-015a)
1. `setAllocation` percentageBp=3000 (30%) for member A → expected contribution computed deterministically.
2. Query `remainingAllocationPercentageBp` for A across all profiles.
3. `setAllocation` that would push A's cross-profile total over 100% → **expect rejection with remaining %**
   (FR-015a).
4. `setAllocation` percentageBp=12000 → **expect range rejection** (FR-013).

### 3. Track contributions (US3, FR-017/FR-019/SC-005)
1. `recordContribution` below expected for A → `standing.state = BEHIND`, variance equals exact shortfall.
2. Record contributions for all members → `poolTotal` equals Σ records exactly (SC-005), zero variance.
3. Confirm a below-expected member does **not** block `fundGoal`/`paySharedDebt` (FR-019).

### 4. Dynamic redistribution preserves history (US4, FR-016/SC-006)
1. Note current `ContributionPlan.version` and a prior period's expected amounts.
2. `redistribute` with new percentages → new plan `version`, effective forward.
3. Re-query the prior period → **expect prior expected amounts and records unchanged** (SC-006).

### 5. Shared elements (US5, FR-009/FR-018/FR-020/FR-020a)
1. `createSharedGoal` → progress 0; `fundGoal` → `fundedAmount` increases by exact amount.
2. `paySharedDebt` → `outstandingBalance` decreases by exact amount; overpayment **rejected** (CHK029).
3. `setDebtResponsibility` for members → set must sum to 100% (FR-020a); defaults to contribution %.
4. Record shared budget spending → `remaining = limit − spent` exact (FR-018).

### 6. Isolated personal accounts (US6, FR-004/FR-010a)
1. Create a personal `Account` → not visible to other members; excluded from pool calculations.
2. `recordContribution` with `sourceAccountId` → only the contributed amount enters the pool, not the
   account balance (FR-010).

### 7. AI coaching is read-only (US7, FR-022/FR-023/SC-008)
1. `coachingInsights(sharedProfileId)` → returns advisory summary + suggestions, permission-scoped.
2. Confirm no mutation occurred (inspect audit/outbox) — **0 state changes from the AI path** (SC-008).
3. Applying a suggestion requires calling a normal validated mutation as a permitted human.

## Determinism & money integrity checks

- Run the domain unit suites: `pnpm test:unit` — contribution/distribution/standing calculators must be
  pure and produce identical outputs for identical inputs (FR-012/FR-021), all money in integer cents.
- Contract test: `pnpm test:contract` — generated SDL matches `contracts/schema.graphql`.
- Tenant isolation: `pnpm test:integration` — a query under tenant B cannot read tenant A rows (RLS).

## Expected outcomes summary

| Scenario | Pass condition | Requirement |
|----------|----------------|-------------|
| Permission denial | Viewer write rejected, no change | SC-003 |
| Personal isolation | Other members' personal accounts invisible | SC-004 |
| Cross-profile cap | >100% allocation rejected | FR-015a |
| Reconciliation | poolTotal == Σ records (zero variance) | SC-005 |
| History preserved | Prior period unchanged after redistribution | SC-006 |
| AI boundary | 0 state changes from coaching path | SC-008 |
