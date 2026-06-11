/**
 * US4 — redistribution preserves history (T073 / SC-006 / FR-016). A redistribution creates a new
 * plan version; prior/current period snapshots and their recorded contributions are unchanged, and
 * the new version applies only to the next period opened. Requires a live RLS-enabled PostgreSQL.
 */
import { ContributionsTestKit } from './helpers/contributions-test-kit';

describe('US4 history — forward-only redistribution (SC-006)', () => {
  const kit = new ContributionsTestKit();

  beforeAll(() => kit.setup());
  afterAll(() => kit.teardown());

  it('keeps prior-period expected amounts and records unchanged; next period uses the new plan', async () => {
    const a = await kit.profileWithOwner({ currency: 'USD', periodLength: 'MONTHLY' });
    const member = await kit.addMember(a.owner, a.profile.id, 'CONTRIBUTOR');

    // Plan v1: owner 100.00 @ 50% (expected 50.00); member 200.00 @ 25% (expected 50.00).
    kit.unwrapOk(await kit.contributions.setDeclaredIncome(a.owner, { sharedProfileId: a.profile.id, membershipId: a.ownerMembershipId, amountCents: 100_00n }));
    kit.unwrapOk(await kit.contributions.setAllocation(a.owner, { sharedProfileId: a.profile.id, membershipId: a.ownerMembershipId, percentageBp: 5000 }));
    kit.unwrapOk(await kit.contributions.setDeclaredIncome(member.user, { sharedProfileId: a.profile.id, membershipId: member.membershipId, amountCents: 200_00n }));
    kit.unwrapOk(await kit.contributions.setAllocation(member.user, { sharedProfileId: a.profile.id, membershipId: member.membershipId, percentageBp: 2500 }));

    // Open P1 (snapshot v1) by recording.
    kit.unwrapOk(await kit.contributions.recordContribution(a.owner, { sharedProfileId: a.profile.id, membershipId: a.ownerMembershipId, amountCents: 50_00n }));
    const p1 = await kit.tenancy.withTenant(kit.tenantId, (tx) => kit.repo.openPeriod(tx, a.profile.id));

    const ownerExpectedBefore = await kit.tenancy.withTenant(kit.tenantId, async (tx) => {
      const members = await kit.periodService.snapshotMembers(tx, p1!);
      return members.find((m) => m.membershipId === a.ownerMembershipId)!;
    });
    expect(kit.analytics.expectedFor(ownerExpectedBefore.incomeCents, ownerExpectedBefore.percentageBp)).toBe(50_00n);

    // Redistribute → plan v2 (owner 80%, member 20%).
    const plan = kit.unwrapOk(
      await kit.contributions.redistribute(a.owner, a.profile.id, [
        { membershipId: a.ownerMembershipId, percentageBp: 8000 },
        { membershipId: member.membershipId, percentageBp: 2000 },
      ]),
    );
    expect(plan.version).toBe(2);

    // P1 still references v1: owner expected + records unchanged (history preserved).
    const after = await kit.tenancy.withTenant(kit.tenantId, async (tx) => {
      const members = await kit.periodService.snapshotMembers(tx, p1!);
      const owner = members.find((m) => m.membershipId === a.ownerMembershipId)!;
      const recordedSum = await kit.repo.actualForMember(tx, p1!.id, a.ownerMembershipId);
      const reloaded = await tx.contributionPeriod.findUnique({ where: { id: p1!.id } });
      return { owner, recordedSum, planVersionSnapshot: reloaded!.planVersionSnapshot };
    });
    expect(after.planVersionSnapshot).toBe(1);
    expect(after.owner.percentageBp).toBe(5000);
    expect(kit.analytics.expectedFor(after.owner.incomeCents, after.owner.percentageBp)).toBe(50_00n);
    expect(after.recordedSum).toBe(50_00n);

    // Roll P1 over → P2 opens with the NEW version (owner expected 100.00 × 80% = 80.00).
    await kit.tenancy.withTenant(kit.tenantId, (tx) =>
      tx.contributionPeriod.update({ where: { id: p1!.id }, data: { endDate: new Date(Date.now() - 1000) } }),
    );
    await kit.periodService.rolloverForTenant(kit.tenantId);

    const p2 = await kit.tenancy.withTenant(kit.tenantId, async (tx) => {
      const open = (await kit.repo.openPeriod(tx, a.profile.id))!;
      const members = await kit.periodService.snapshotMembers(tx, open);
      return { snapshot: open.planVersionSnapshot, owner: members.find((m) => m.membershipId === a.ownerMembershipId)! };
    });
    expect(p2.snapshot).toBe(2);
    expect(kit.analytics.expectedFor(p2.owner.incomeCents, p2.owner.percentageBp)).toBe(80_00n);
  });
});
