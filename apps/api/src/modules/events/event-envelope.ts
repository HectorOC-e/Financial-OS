/**
 * Versioned domain-event envelope (contracts/events.md, Principle VI). Every event is append-only
 * and replayable. `schemaVersion` starts at 1; breaking payload changes increment it.
 */
export interface DomainEventEnvelope<P = Record<string, unknown>> {
  eventId: string;
  eventType: string;
  schemaVersion: number;
  tenantId: string;
  aggregateType: string;
  aggregateId: string;
  occurredAt: string; // ISO-8601
  actorMembershipId: string | null;
  payload: P;
}

/** Input to the outbox writer; envelope fields (eventId/occurredAt) are generated on write. */
export interface NewDomainEvent<P = Record<string, unknown>> {
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  schemaVersion?: number; // defaults to 1
  actorMembershipId?: string | null;
  payload: P;
}

/** Canonical event-type catalog (contracts/events.md). */
export const EventType = {
  SharedProfileCreated: 'SharedProfileCreated',
  MemberInvited: 'MemberInvited',
  InvitationAccepted: 'InvitationAccepted',
  InvitationDeclined: 'InvitationDeclined',
  InvitationExpired: 'InvitationExpired',
  DeclaredIncomeSet: 'DeclaredIncomeSet',
  ProfileArchived: 'ProfileArchived',
  MemberRoleChanged: 'MemberRoleChanged',
  MemberLeft: 'MemberLeft',
  OwnerNominated: 'OwnerNominated',
  OwnershipTransferred: 'OwnershipTransferred',
  AllocationSet: 'AllocationSet',
  PercentageRedistributed: 'PercentageRedistributed',
  ContributionRecorded: 'ContributionRecorded',
  GoalFunded: 'GoalFunded',
  SharedDebtPaid: 'SharedDebtPaid',
  DebtResponsibilitySet: 'DebtResponsibilitySet',
  ContributionPeriodOpened: 'ContributionPeriodOpened',
  ContributionPeriodClosed: 'ContributionPeriodClosed',
} as const;

export type EventTypeName = (typeof EventType)[keyof typeof EventType];

export const DEFAULT_SCHEMA_VERSION = 1;
