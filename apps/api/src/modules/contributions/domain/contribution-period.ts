/**
 * ContributionPeriod + ContributionRecord domain (T057/T060 — FR-016a/FR-017/FR-019/SC-005).
 *
 * Pure, deterministic, framework-free. A period snapshots the active plan version and each member's
 * declared income at open time (R7); expected amounts derive from that frozen snapshot so later
 * income/percentage edits affect only future periods (forward-only, FR-016a). Standing compares
 * snapshotted expected vs actual recorded; reconciliation proves the emergent pool equals Σ records
 * with shortfall tracked but never blocking (FR-019).
 */
import { ContributionStanding, computeStanding, expectedContributionCents } from './analytics/analytics';

export type PeriodLength = 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY';
export type PeriodStatus = 'OPEN' | 'CLOSED';

/** Per-member declared income frozen at period open: membershipId → income cents (as string in JSON). */
export type IncomeSnapshot = Record<string, string>;

export interface PeriodWindow {
  startDate: Date;
  endDate: Date;
}

/** Deterministic end instant for a period that starts at `start` (UTC, exclusive end). */
export function periodEndDate(start: Date, length: PeriodLength): Date {
  const d = new Date(start.getTime());
  switch (length) {
    case 'WEEKLY':
      d.setUTCDate(d.getUTCDate() + 7);
      return d;
    case 'MONTHLY':
      d.setUTCMonth(d.getUTCMonth() + 1);
      return d;
    case 'QUARTERLY':
      d.setUTCMonth(d.getUTCMonth() + 3);
      return d;
    case 'YEARLY':
      d.setUTCFullYear(d.getUTCFullYear() + 1);
      return d;
  }
}

/** The window for the first period of a profile, starting at `start`. */
export function firstPeriodWindow(start: Date, length: PeriodLength): PeriodWindow {
  return { startDate: start, endDate: periodEndDate(start, length) };
}

/** The next window after a period closes — begins exactly where the previous ended (no gap/overlap). */
export function nextPeriodWindow(previousEnd: Date, length: PeriodLength): PeriodWindow {
  return { startDate: previousEnd, endDate: periodEndDate(previousEnd, length) };
}

/** True once a period has reached its end instant and should auto-close (FR-016a). */
export function isPeriodDue(endDate: Date, now: Date): boolean {
  return now.getTime() >= endDate.getTime();
}

export interface MemberSnapshot {
  membershipId: string;
  incomeCents: bigint;
  percentageBp: number;
}

/** Expected contribution for one member from the period snapshot (income × percentage). */
export function expectedForMember(member: MemberSnapshot): bigint {
  return expectedContributionCents(member.incomeCents, member.percentageBp);
}

/** A member's standing for the period: snapshot expected vs Σ of their actual records. */
export function memberStanding(member: MemberSnapshot, actualCents: bigint): ContributionStanding {
  return computeStanding(expectedForMember(member), actualCents);
}

export interface Reconciliation {
  poolExpectedCents: bigint;
  poolActualCents: bigint;
  /** actual − expected. Negative ⇒ collective shortfall. */
  varianceCents: bigint;
  /** Unmet expected (max(0, expected − actual)); tracked, never blocks spending (FR-019). */
  shortfallCents: bigint;
  /** True when actual exactly meets expected (zero variance — SC-005). */
  reconciled: boolean;
}

/**
 * Reconcile a period: the emergent pool is the exact Σ of actual records (FR-015); compared against
 * the snapshotted expected total. Deterministic integer math — exact, never rounded.
 */
export function reconcile(members: MemberSnapshot[], actualByMember: Map<string, bigint>): Reconciliation {
  let expected = 0n;
  let actual = 0n;
  for (const m of members) {
    expected += expectedForMember(m);
    actual += actualByMember.get(m.membershipId) ?? 0n;
  }
  // Include records from members not in the snapshot (defensive — still part of the emergent pool).
  for (const [mid, amt] of actualByMember) {
    if (!members.some((m) => m.membershipId === mid)) actual += amt;
  }
  const variance = actual - expected;
  return {
    poolExpectedCents: expected,
    poolActualCents: actual,
    varianceCents: variance,
    shortfallCents: variance < 0n ? -variance : 0n,
    reconciled: variance === 0n,
  };
}
