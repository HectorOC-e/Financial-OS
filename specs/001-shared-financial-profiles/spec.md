# Feature Specification: Shared Financial Profiles

**Feature Branch**: `001-shared-financial-profiles`

**Created**: 2026-06-04

**Status**: Draft

**Input**: User description: "Create specification for Shared Financial Profiles. Users can have personal financial profiles, shared profiles, multiple wallets, multiple accounts, investment accounts, emergency funds, credit cards, debt accounts. Shared profiles must allow multiple users, isolated permissions, percentage-based income distribution, shared goals, shared debts, shared investments, shared credit cards. Users must be able to allocate percentages of income, redistribute dynamically, manage shared budgets, track contributions, maintain isolated personal accounts. The system must support future AI financial coaching."

## Clarifications

### Session 2026-06-04

- Q: Can a single wallet/account belong to more than one profile at the same time? → A: No — each wallet/account belongs to exactly one profile; money moves between profiles only via explicit contributions/transfers.
- Q: What happens when a member's income allocations across multiple profiles would exceed 100%? → A: Block — reject any allocation that pushes the member's combined cross-profile committed percentage over 100%, and show the remaining available percentage.
- Q: Should shared debts carry per-member responsibility percentages distinct from contribution %? → A: Optional override — debt responsibility defaults to each member's contribution %, but can be set explicitly per shared debt/credit card when it should differ.
- Q: Can a member disconnect/leave a shared profile, and what happens to their data? → A: A non-owner member can leave anytime; historical contributions and audit records are preserved immutably while future contributions and unmet responsibility shares are released/reassigned. An owner must transfer ownership before leaving.
- Q: Can a shared profile have multiple owners, or always exactly one? → A: Exactly one owner at a time; co-management is handled via the Admin role, and ownership is transferable.
- Q: What happens when a payment to a shared debt/credit card exceeds the outstanding balance? → A: Reject the overpayment; a member may pay at most the exact outstanding balance (balance never goes below zero).
- Q: When a member leaves, what happens to their debt responsibility shares on outstanding shared debts? → A: Reassign proportionally across remaining members in proportion to their existing responsibility shares, keeping each debt's responsibilities summed to 100%.
- Q: How does ownership transfer take effect? → A: The owner nominates an existing ACTIVE member who must explicitly accept; ownership transfers only on acceptance, the current owner remains owner until then, and both nomination and acceptance are audited.
- Q: How are residual cents allocated when a percentage split does not divide evenly? → A: Largest-remainder method — floor each share, then distribute leftover cents to the members with the largest fractional remainders, ties broken by stable membership ID order.
- Q: What is the freshness bound for "at any time" contribution-standing visibility (SC-007)? → A: Standings and pool totals MUST reflect a recorded contribution within 5 seconds.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create and Govern a Shared Profile (Priority: P1)

A user creates a shared financial profile (e.g., a household, couple, or business partnership), invites
one or more other users to join it, and assigns each member a permission level that governs what they
can see and do within the profile. Each member's personal financial data remains private and is never
exposed through the shared profile unless that member explicitly contributes or shares it.

**Why this priority**: Without the ability to create a shared profile and control who can do what,
none of the shared financial behaviors (income distribution, shared goals, shared debts) can exist.
This is the foundational capability and the minimum viable slice.

**Independent Test**: Create a shared profile, invite a second user, assign them a permission level,
and confirm the second user can access only what their permission level allows while the creator's
personal accounts remain invisible to them.

**Acceptance Scenarios**:

1. **Given** a user with a personal profile, **When** they create a shared profile and name it,
   **Then** they become the owner and the shared profile appears in their list of profiles separate
   from their personal profile.
2. **Given** an owner of a shared profile, **When** they invite another user and assign a permission
   level, **Then** the invited user gains access to the shared profile scoped strictly to that level.
3. **Given** a member with view-only permission, **When** they attempt to modify a shared budget or
   allocation, **Then** the action is rejected and no change is persisted.
4. **Given** a member of a shared profile, **When** they view the shared profile, **Then** they cannot
   see any other member's personal (non-shared) accounts, balances, or transactions.
5. **Given** an owner, **When** they change a member's permission level or remove a member,
   **Then** the change is recorded in an audit trail with actor, timestamp, and before/after values.

---

### User Story 2 - Allocate Percentage-Based Income Contributions (Priority: P1)

Each member of a shared profile declares what percentage of their income they will contribute toward
the shared profile's pooled obligations (shared budgets, goals, debts). The system computes each
member's expected contribution amount from their declared income and percentage, and presents the
combined contribution plan for the profile.

**Why this priority**: Percentage-based income distribution is the core differentiator of shared
profiles and the basis for fairness in shared budgets, goals, and debts. It must exist alongside
profile creation to deliver real value.

**Independent Test**: For a shared profile with two members, set each member's income and contribution
percentage, and confirm the system computes the correct expected contribution amount for each member
and the correct combined pool total.

**Acceptance Scenarios**:

1. **Given** a member with a declared income, **When** they set their contribution percentage,
   **Then** the system computes their expected contribution amount deterministically and displays it.
2. **Given** multiple members with set percentages, **When** the profile's contribution plan is viewed,
   **Then** the combined expected pool equals the sum of each member's computed contribution.
3. **Given** a member sets a percentage outside the allowed range (below 0% or above 100%),
   **When** they submit it, **Then** the system rejects the value and explains the valid range.
4. **Given** a contribution amount entered on a client, **When** it is submitted, **Then** the server
   independently recomputes and validates the amount before accepting it.

---

### User Story 3 - Track Contributions Against Allocations (Priority: P2)

Members record or have recorded the actual amounts they contribute to the shared profile over a period.
The system compares actual contributions to expected contributions and shows each member's standing
(on track, ahead, or behind) and the profile's overall funding status.

**Why this priority**: Allocation without tracking provides no accountability. Tracking turns the
contribution plan into an actionable, monitorable agreement, but depends on US2 existing first.

**Independent Test**: Record actual contributions for each member over a period and confirm the system
correctly reports each member's variance against their expected contribution and the profile's total
funding level.

**Acceptance Scenarios**:

1. **Given** an expected contribution for a member, **When** an actual contribution is recorded,
   **Then** the system updates that member's contribution standing for the period.
2. **Given** a member who has contributed less than their expected amount, **When** the profile status
   is viewed, **Then** that member is shown as behind by the exact shortfall amount.
3. **Given** a full contribution period, **When** all actual contributions are recorded, **Then** the
   profile's total contributions reconcile exactly with the sum of recorded member contributions.

---

### User Story 4 - Dynamically Redistribute Percentages (Priority: P2)

When a member's income changes, a member joins or leaves, or the group renegotiates, an authorized
member updates the contribution percentages. The system applies the new distribution and makes clear
which period the change takes effect from, without corrupting historical contribution records.

**Why this priority**: Real households and partnerships change over time. Dynamic redistribution keeps
the profile accurate, but it is meaningful only after allocation and tracking exist.

**Independent Test**: Change one member's contribution percentage mid-period and confirm the new
expected contributions are computed correctly going forward while already-recorded contributions for
prior periods remain unchanged.

**Acceptance Scenarios**:

1. **Given** an existing distribution, **When** an authorized member updates one or more percentages,
   **Then** the system recomputes expected contributions according to the redistribution rules.
2. **Given** a redistribution is applied, **When** historical periods are viewed, **Then** prior
   recorded contributions and their prior expected amounts are preserved unchanged.
3. **Given** a redistribution where any member's percentage falls outside the valid 0–100% range,
   **When** it is submitted, **Then** the system rejects it and explains the valid range.

---

### User Story 5 - Manage Shared Financial Elements (Priority: P2)

Within a shared profile, members manage shared budgets, shared goals, shared debts, shared investments,
and shared credit cards. Each shared element draws on or is funded by the pooled contributions, and its
state is visible to members according to their permission level.

**Why this priority**: These are the concrete things contributions fund and that members collaborate on.
They deliver the tangible outcomes of a shared profile but require the profile, permissions, and
contribution foundation to be in place first.

**Independent Test**: Create a shared goal and a shared debt within a profile, fund them from pooled
contributions, and confirm balances and progress update correctly and are visible per permission level.

**Acceptance Scenarios**:

1. **Given** a shared profile with pooled contributions, **When** a member with appropriate permission
   creates a shared goal with a target amount, **Then** the goal appears with zero progress and can be
   funded from the pool.
2. **Given** a shared debt or shared credit card, **When** a payment is made from pooled funds,
   **Then** the outstanding balance decreases by exactly the payment amount.
3. **Given** a shared budget for a category, **When** shared spending in that category is recorded,
   **Then** the remaining budget reflects the exact difference.
4. **Given** a shared investment, **When** its recorded value changes, **Then** each member sees the
   shared investment value according to their permission level, with no exposure of personal holdings.

---

### User Story 6 - Maintain Isolated Personal Accounts (Priority: P3)

While participating in one or more shared profiles, a user continues to maintain a personal profile
with their own wallets, accounts, investment accounts, emergency funds, credit cards, and debt accounts.
Personal accounts are fully isolated from shared profiles and from other members.

**Why this priority**: Users must retain private financial lives independent of any group. This is
important for trust and adoption but builds on the account model established by earlier stories.

**Independent Test**: As a member of a shared profile, create personal accounts and confirm they are
invisible to other members of the shared profile and excluded from shared pool calculations.

**Acceptance Scenarios**:

1. **Given** a user who is a member of a shared profile, **When** they create a personal account,
   **Then** that account is associated only with their personal profile and excluded from all shared
   profile views and calculations.
2. **Given** a user with both personal and shared accounts, **When** another member views the shared
   profile, **Then** none of the first user's personal accounts, balances, or transactions are visible.
3. **Given** a personal account, **When** the user contributes from it to a shared profile, **Then**
   only the contributed amount is reflected in the shared pool, not the account's underlying balance.

---

### User Story 7 - AI Financial Coaching Readiness (Priority: P3)

The shared and personal financial data is structured and accessible (subject to permissions) so that a
future AI financial coaching capability can analyze contributions, goals, debts, and budgets and offer
recommendations. The AI may produce insights and suggestions but never directly alters financial state.

**Why this priority**: Enables a future high-value capability without committing to building the coach
now. It is a readiness/extensibility concern rather than a present user need, so it is lowest priority.

**Independent Test**: Confirm that contribution, goal, debt, budget, and balance data for a profile can
be retrieved through a permission-respecting, consistent representation suitable for analysis, and that
no analysis pathway can write to financial state.

**Acceptance Scenarios**:

1. **Given** a shared profile's financial data, **When** it is requested for analysis purposes,
   **Then** the data returned respects the requester's permission scope.
2. **Given** an automated/AI recommendation, **When** it proposes a change (e.g., adjust a percentage),
   **Then** the change is only applied after a permitted human action through normal validated flows.
3. **Given** the same financial data, **When** analyzed from different channels (e.g., a report vs. an
   automated coach), **Then** the underlying figures are consistent.

---

### Edge Cases

- What happens when a member declares zero income but a nonzero contribution percentage? (Expected
  contribution computes to zero; profile status reflects no obligation from that member.)
- What happens when a member's allocations across multiple profiles would exceed 100% of income?
  (The allocation is rejected; the system shows the member's remaining available percentage. See FR-015a.)
- How does the system handle the pooled total being lower than the profile's planned obligations?
  (Percentages are independent, so the pool is emergent; the shortfall is tracked and reported, not blocked.)
- What happens when a member leaves a shared profile that has outstanding shared debts or unmet goals?
  (Their historical contributions and audit records are preserved immutably; future contributions cease
  and their debt responsibility shares are reassigned proportionally to remaining members. An owner must
  transfer ownership before leaving. See FR-007a, FR-020a.)
- How does the system handle currency rounding so that the sum of individual contributions exactly
  equals the pooled total with no lost or phantom fractions?
- What happens when a member is removed while having recorded contributions in the current period?
  (Their historical contributions remain; future expected contributions cease.)
- How does the system handle simultaneous edits to the same shared element by two members?
- What happens when a shared credit card or debt is overpaid? (The overpayment is rejected; a member may
  pay at most the exact outstanding balance, so the balance never goes below zero. See FR-020b.)

## Requirements *(mandatory)*

### Functional Requirements

#### Profiles & Membership

- **FR-001**: Users MUST be able to own a personal financial profile that is private to them by default.
- **FR-002**: Users MUST be able to create shared financial profiles and invite other users to join them.
- **FR-003**: A user MUST be able to belong to multiple shared profiles simultaneously while retaining
  one personal profile.
- **FR-004**: The system MUST keep each member's personal (non-shared) accounts isolated and invisible to
  other members of any shared profile.

#### Permissions & Isolation

- **FR-005**: Each shared profile MUST support four isolated permission levels assigned per member,
  enforced for every read and write action:
  - **Owner**: full control, including membership, permission assignment, and all shared elements.
    A shared profile has exactly one owner at any time; ownership is transferable to another member.
    Co-management by multiple parties is achieved by granting the Admin role, not multiple owners.
  - **Admin**: manage shared elements (goals, debts, investments, credit cards, budgets) and
    contribution plans, but cannot change ownership or transfer the profile.
  - **Contributor**: contribute to the pool and manage their own contribution settings and data;
    cannot manage other members or alter shared-element structure.
  - **Viewer**: read-only access to shared elements they are permitted to see; no write actions.
- **FR-006**: The system MUST reject any action a member's permission level does not allow and persist
  no change when rejected.
- **FR-007**: The system MUST record an immutable audit entry (actor, timestamp, before/after values)
  for every membership and permission change on a shared profile.
- **FR-007a**: A non-owner member MUST be able to leave a shared profile at any time. On leaving, the
  system MUST preserve that member's historical contribution and audit records immutably, while
  releasing their future expected contributions and reassigning their debt responsibility shares
  proportionally to the remaining members (per FR-020a). An owner MUST transfer ownership to another
  member before they can leave;
  leaving and ownership transfer MUST be recorded in the audit trail.
- **FR-007b**: Ownership transfer MUST follow a nominate-and-accept flow: the current owner nominates an
  existing ACTIVE member, and ownership transfers only when that member explicitly accepts. The current
  owner retains ownership until acceptance. Both the nomination and the acceptance MUST be recorded in the
  audit trail. A nomination MUST target an ACTIVE member (not INVITED or LEFT).

#### Accounts & Financial Elements

- **FR-008**: Users MUST be able to hold multiple wallets, multiple accounts, investment accounts,
  emergency funds, credit cards, and debt accounts within a profile.
- **FR-009**: Shared profiles MUST support shared goals, shared debts, shared investments, and shared
  credit cards visible to members per their permission level.
- **FR-010**: The system MUST keep shared financial elements separate from personal accounts such that
  personal balances are never included in shared pool calculations unless explicitly contributed.
- **FR-010a**: Each wallet and account MUST belong to exactly one profile (a personal profile OR a single
  shared profile). A wallet/account MUST NOT be linked to multiple profiles. Money moves between profiles
  only through explicit contributions or transfers, never through shared account ownership.

#### Income Distribution & Contributions

- **FR-011**: Members MUST be able to declare an income figure and allocate a percentage of that income
  as their contribution to a shared profile.
- **FR-012**: The system MUST compute each member's expected contribution amount deterministically from
  their declared income and percentage, producing identical results for identical inputs.
- **FR-013**: The system MUST reject contribution percentages outside the valid range (below 0% or
  above 100%) and explain the valid range.
- **FR-014**: The system MUST validate all monetary contribution values server-side, independently
  recomputing client-submitted amounts before persistence.
- **FR-015**: Each member MUST independently allocate any percentage (0–100%) of their own declared
  income as their contribution; the pooled total MUST equal the sum of the resulting member
  contribution amounts (the pool size is emergent, not a fixed target).
- **FR-015a**: The system MUST cap each member's total committed income percentage across ALL profiles
  they belong to at 100%. Any allocation or redistribution that would push a member's combined
  cross-profile committed percentage above 100% MUST be rejected, with a message indicating the
  member's remaining available percentage.
- **FR-016**: Members MUST be able to redistribute contribution percentages dynamically, with the
  system recomputing future expected contributions while preserving historical records unchanged.

#### Contribution Tracking & Budgets

- **FR-017**: The system MUST track each member's actual contributions and compare them against their
  expected contributions for each period, reporting variance (on track, ahead, behind by an exact amount).
- **FR-018**: The system MUST allow members to define and manage shared budgets, and MUST reflect the
  exact remaining amount as shared spending is recorded.
- **FR-019**: The system MUST ensure that the sum of recorded individual contributions reconciles
  exactly with the pooled total, with no lost or phantom fractional amounts. When a member's expected
  contribution is unmet, the system MUST track and report the shortfall but MUST NOT block dependent
  shared spending or funding; shared spending proceeds against available pooled funds, and accountability
  is informational.
- **FR-020**: The system MUST allow funding shared goals, paying down shared debts, and paying shared
  credit cards from pooled contributions, adjusting balances by exactly the transacted amount.
- **FR-020b**: The system MUST reject any payment to a shared debt or shared credit card that exceeds its
  outstanding balance; the maximum acceptable payment equals the exact outstanding balance, ensuring the
  balance never goes below zero.
- **FR-020a**: Each shared debt and shared credit card MUST support a per-member responsibility
  percentage. By default each member's responsibility equals their income-contribution percentage;
  members with appropriate permission MUST be able to override responsibility percentages per shared
  debt/credit card. Responsibility percentages for a given shared debt MUST sum to 100%. When a member
  leaves, their responsibility share on each outstanding shared debt MUST be reassigned to the remaining
  members in proportion to those members' existing responsibility shares, so the set continues to sum to
  100%.

#### Money Integrity & AI Readiness

- **FR-021**: All financial calculations (contributions, distributions, balances, goal progress, debt
  paydown) MUST be deterministic and produce consistent results across all channels (backend, mobile,
  exports, automated analysis).
- **FR-022**: The system MUST expose financial data for analysis in a permission-respecting form so a
  future AI financial coaching capability can consume it.
- **FR-023**: Any AI or automated recommendation MUST NOT directly alter financial state; changes MUST
  occur only through permitted, validated human-initiated actions.
- **FR-024**: Monetary values MUST be represented and computed without precision loss; balances of
  debts and credit cards MUST NOT go below zero through normal operations.
- **FR-024a**: When a percentage-based split (contributions, debt responsibility, or any pooled
  allocation) does not divide evenly into whole minor units, the system MUST allocate residual units
  using the largest-remainder method: floor each member's share, then distribute the leftover units one
  at a time to the members with the largest fractional remainders, breaking ties by a stable membership
  ID order. The result MUST be deterministic and MUST reconcile exactly to the total (no lost or phantom
  units).

### Key Entities *(include if feature involves data)*

- **User**: An individual who owns one personal profile and may belong to multiple shared profiles.
- **Personal Profile**: A private collection of a single user's accounts and financial elements,
  isolated from all shared profiles.
- **Shared Profile**: A collaborative profile owned by exactly one user (ownership transferable) and
  joined by multiple members, holding shared financial elements and a contribution plan.
- **Membership**: The association of a user to a shared profile, carrying that user's permission level
  and contribution settings within the profile.
- **Permission Level**: The set of allowed read/write actions a member has within a shared profile.
- **Account**: A financial holding within a profile — including wallet, general account, investment
  account, emergency fund, credit card, and debt account types. Each account belongs to exactly one
  profile.
- **Contribution Plan**: The set of member percentage allocations and computed expected contributions
  for a shared profile over a period.
- **Contribution Record**: An actual amount contributed by a member toward a shared profile in a period.
- **Shared Goal**: A target amount the profile collectively funds from the pool.
- **Shared Debt / Shared Credit Card**: An obligation the profile collectively pays down from the pool,
  carrying per-member responsibility percentages (defaulting to each member's contribution %, overridable)
  that sum to 100%.
- **Shared Investment**: An investment held collectively by the profile.
- **Shared Budget**: A planned spending limit for a category within the shared profile.
- **Audit Entry**: An immutable record of a membership/permission or financially significant change.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can create a shared profile, invite a member, and assign a permission level in
  under 3 minutes.
- **SC-002**: For any set of member incomes and percentages, the computed expected contributions and
  pooled total are correct in 100% of cases and identical on repeated computation.
- **SC-003**: 100% of attempts by a member to perform an action outside their permission level are
  rejected, with no resulting change to financial state.
- **SC-004**: In 100% of cases, a member's personal accounts are never visible to other members of any
  shared profile they belong to.
- **SC-005**: After recording all contributions for a period, the profile's reported total reconciles
  exactly (zero variance) with the sum of individual contribution records.
- **SC-006**: When a percentage is redistributed, 100% of historical contribution records and their
  prior expected amounts remain unchanged.
- **SC-007**: Members can see each member's contribution standing (on track / ahead / behind by an
  exact amount) for the current period at any time, and a recorded contribution is reflected in standings
  and pool totals within 5 seconds.
- **SC-008**: No automated or AI-driven pathway can alter financial state without a permitted,
  validated human action (0 unauthorized state changes).

## Assumptions

- A user has exactly one personal profile; "multiple profiles" refers to one personal profile plus any
  number of shared profiles the user participates in.
- Income figures used for percentage allocation are values associated with a member within a shared
  profile (declared or derived) rather than a global system-of-record salary feed; the precise source
  can be refined during planning.
- Contribution periods are recurring time windows (e.g., monthly); the exact period length is
  configurable per shared profile and defaults to a standard monthly cycle.
- "Isolated permissions" means permission grants are scoped per shared profile and do not leak across
  profiles a user belongs to.
- All members of a shared profile transact in a single shared currency for that profile; multi-currency
  shared profiles are out of scope for this feature.
- The AI financial coaching capability itself is out of scope; this feature only ensures data
  structure and access readiness for it (no coaching model is built here).
- Standard authentication and user identity are assumed to already exist in the platform and are reused.

## Dependencies

- Requires an existing user identity/authentication capability.
- Requires the platform's account and money-handling domain foundation (deterministic money
  representation and server-side validation) per the project constitution.
