# Domain Event Contracts — Shared Financial Profiles

Events are published via the transactional outbox (R4) and consumed by BullMQ workers. Every event shares
an envelope and is **append-only** and **replayable**. Schema version starts at `1`.

## Envelope (all events)

```jsonc
{
  "eventId": "uuid",
  "eventType": "string",        // see catalog below
  "schemaVersion": 1,
  "tenantId": "uuid",           // tenant isolation (Principle IX)
  "aggregateType": "string",    // SharedProfile | Membership | ContributionPlan | SharedDebt | ...
  "aggregateId": "uuid",
  "occurredAt": "ISO-8601",
  "actorMembershipId": "uuid|null",
  "payload": { /* event-specific */ }
}
```

Versioning policy: additive fields bump nothing; breaking payload changes increment `schemaVersion` and
keep old consumers working until migrated (Principle VI / Architectural Constraints).

## Event Catalog

| Event Type | Aggregate | Payload (key fields) | Triggers / Consumers |
|------------|-----------|----------------------|----------------------|
| `SharedProfileCreated` | SharedProfile | `name, baseCurrency, ownerMembershipId` | Init period; projections |
| `MemberInvited` | Membership | `userId, role` | Notification consumer |
| `InvitationAccepted` | Membership | `userId` | Recompute pool; audit |
| `MemberRoleChanged` | Membership | `from, to` | Audit; cache invalidation |
| `MemberLeft` | Membership | `releasedAllocationBp, reassignedResponsibilities[]` | Recompute plan; reassign debt shares proportionally (FR-020a) |
| `OwnerNominated` | SharedProfile | `nomineeMembershipId` | Audit; notify nominee (FR-007b) |
| `OwnershipTransferred` | SharedProfile | `fromMembershipId, toMembershipId` | Audit (completes on nominee acceptance, FR-007b) |
| `AllocationSet` | ContributionPlan | `membershipId, percentageBp` | Invalidate standing/pool cache |
| `PercentageRedistributed` | ContributionPlan | `newVersion, effectiveFromPeriodId` | New plan version; invalidate cache; **must not alter history** |
| `ContributionRecorded` | ContributionRecord | `membershipId, periodId, amountCents` | Update standing; invalidate pool cache; AI projection refresh |
| `GoalFunded` | SharedGoal | `amountCents, fundedAmount` | Projection; notification |
| `SharedDebtPaid` | SharedDebt | `amountCents, outstandingBalance` | Projection |
| `DebtResponsibilitySet` | SharedDebt | `membershipId, percentageBp` | Audit |
| `ContributionPeriodOpened` | ContributionPeriod | `startDate, endDate, planVersionSnapshot` | Snapshot expected amounts (R7) |
| `ContributionPeriodClosed` | ContributionPeriod | `reconciledTotalCents` | Freeze period (immutability) |

## Consumer guarantees

- **Idempotent**: consumers key on `eventId`; re-delivery is safe (replay support).
- **Cache invalidation**: standing/pool caches keyed `tenantId:profileId:periodId` are invalidated by
  `ContributionRecorded`, `AllocationSet`, `PercentageRedistributed`, `GoalFunded`, `SharedDebtPaid` (R8).
- **AI boundary**: the `ai-coaching` projection consumer is **read-only** — it refreshes a read model for
  coaching prompts and never emits commands or writes financial state (Principle III, FR-023).
- **Audit**: an audit consumer persists `AuditEntry` rows for membership/permission and financially
  significant events (FR-007).
