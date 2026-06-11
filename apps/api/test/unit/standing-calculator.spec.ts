/**
 * Standing & reconciliation unit tests (T056 — FR-017/FR-019/SC-005). Expected vs actual → variance +
 * ON_TRACK/AHEAD/BEHIND, exact integer amounts; reconciliation proves Σ records vs expected with
 * shortfall tracked but non-blocking.
 */
import {
  memberStanding,
  reconcile,
  periodEndDate,
  nextPeriodWindow,
  isPeriodDue,
  MemberSnapshot,
} from '../../src/modules/contributions/domain/contribution-period';

const members: MemberSnapshot[] = [
  { membershipId: 'a', incomeCents: 100_00n, percentageBp: 5000 }, // expected 50_00
  { membershipId: 'b', incomeCents: 200_00n, percentageBp: 2500 }, // expected 50_00
];

describe('memberStanding (FR-017)', () => {
  it('is ON_TRACK at exactly expected', () => {
    const s = memberStanding(members[0], 50_00n);
    expect(s).toEqual({ expectedCents: 50_00n, actualCents: 50_00n, varianceCents: 0n, state: 'ON_TRACK' });
  });
  it('is BEHIND below expected with negative variance', () => {
    const s = memberStanding(members[0], 30_00n);
    expect(s.state).toBe('BEHIND');
    expect(s.varianceCents).toBe(-20_00n);
  });
  it('is AHEAD above expected', () => {
    const s = memberStanding(members[0], 60_00n);
    expect(s.state).toBe('AHEAD');
    expect(s.varianceCents).toBe(10_00n);
  });
});

describe('reconcile (SC-005 / FR-019)', () => {
  it('reconciles to zero variance when all contribute their expected', () => {
    const r = reconcile(members, new Map([['a', 50_00n], ['b', 50_00n]]));
    expect(r.poolExpectedCents).toBe(100_00n);
    expect(r.poolActualCents).toBe(100_00n);
    expect(r.varianceCents).toBe(0n);
    expect(r.shortfallCents).toBe(0n);
    expect(r.reconciled).toBe(true);
  });

  it('tracks shortfall without blocking (partial contributions)', () => {
    const r = reconcile(members, new Map([['a', 50_00n], ['b', 10_00n]]));
    expect(r.poolActualCents).toBe(60_00n);
    expect(r.shortfallCents).toBe(40_00n);
    expect(r.reconciled).toBe(false);
  });

  it('emergent pool counts records from members absent in the snapshot', () => {
    const r = reconcile(members, new Map([['a', 50_00n], ['b', 50_00n], ['c', 7n]]));
    expect(r.poolActualCents).toBe(100_07n);
  });
});

describe('period windows (FR-016a)', () => {
  it('computes monthly end and a gapless next window', () => {
    const start = new Date('2026-01-15T00:00:00.000Z');
    const end = periodEndDate(start, 'MONTHLY');
    expect(end.toISOString()).toBe('2026-02-15T00:00:00.000Z');
    const next = nextPeriodWindow(end, 'MONTHLY');
    expect(next.startDate).toEqual(end); // no gap/overlap
    expect(next.endDate.toISOString()).toBe('2026-03-15T00:00:00.000Z');
  });

  it('detects when a period is due to roll over', () => {
    const end = new Date('2026-02-15T00:00:00.000Z');
    expect(isPeriodDue(end, new Date('2026-02-14T23:59:59.000Z'))).toBe(false);
    expect(isPeriodDue(end, end)).toBe(true);
  });
});
