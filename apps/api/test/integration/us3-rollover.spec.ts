/**
 * US3 — period auto-rollover opens a fresh immutable snapshot; the closed period is unchanged
 * (T066 / FR-016a / SC-006). Requires a live RLS-enabled PostgreSQL.
 */
import { ContributionsTestKit } from './helpers/contributions-test-kit';

describe('US3 rollover — auto-close + fresh next period (FR-016a)', () => {
  const kit = new ContributionsTestKit();

  beforeAll(() => kit.setup());
  afterAll(() => kit.teardown());

  it('closes the due period unchanged and opens a successor with a fresh snapshot', async () => {
    const a = await kit.profileWithOwner({ currency: 'USD', periodLength: 'MONTHLY' });
    kit.unwrapOk(await kit.contributions.setDeclaredIncome(a.owner, { sharedProfileId: a.profile.id, membershipId: a.ownerMembershipId, amountCents: 100_00n }));
    kit.unwrapOk(await kit.contributions.setAllocation(a.owner, { sharedProfileId: a.profile.id, membershipId: a.ownerMembershipId, percentageBp: 5000 }));

    // First record opens period P1 with a snapshot of the current income (100.00).
    kit.unwrapOk(await kit.contributions.recordContribution(a.owner, { sharedProfileId: a.profile.id, membershipId: a.ownerMembershipId, amountCents: 50_00n }));
    const p1 = await kit.tenancy.withTenant(kit.tenantId, (tx) => kit.repo.openPeriod(tx, a.profile.id));
    const p1Snapshot = JSON.stringify(p1!.incomeSnapshot);

    // Backdate P1 so it is due, then change income (must affect only the NEXT period — FR-016a).
    await kit.tenancy.withTenant(kit.tenantId, (tx) =>
      tx.contributionPeriod.update({ where: { id: p1!.id }, data: { endDate: new Date(Date.now() - 1000) } }),
    );
    kit.unwrapOk(await kit.contributions.setDeclaredIncome(a.owner, { sharedProfileId: a.profile.id, membershipId: a.ownerMembershipId, amountCents: 999_00n }));

    const rolled = await kit.periodService.rolloverForTenant(kit.tenantId);
    expect(rolled).toBeGreaterThanOrEqual(1);

    const { closed, open } = await kit.tenancy.withTenant(kit.tenantId, async (tx) => {
      const closedP1 = await tx.contributionPeriod.findUnique({ where: { id: p1!.id } });
      const openNext = await kit.repo.openPeriod(tx, a.profile.id);
      return { closed: closedP1, open: openNext };
    });

    // P1 is CLOSED and its snapshot is byte-for-byte unchanged (immutable history).
    expect(closed?.status).toBe('CLOSED');
    expect(JSON.stringify(closed!.incomeSnapshot)).toBe(p1Snapshot);

    // P2 is a new OPEN period beginning where P1 ended, snapshotting the updated income (999.00).
    expect(open).not.toBeNull();
    expect(open!.id).not.toBe(p1!.id);
    expect(open!.status).toBe('OPEN');
    expect(open!.startDate.getTime()).toBe(closed!.endDate.getTime());
    expect((open!.incomeSnapshot as Record<string, string>)[a.ownerMembershipId]).toBe('99900');
  });
});
