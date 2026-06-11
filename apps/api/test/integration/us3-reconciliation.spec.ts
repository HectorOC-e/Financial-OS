/**
 * US3 — reconciliation to zero variance after all records (T064 / SC-005 / FR-019). The emergent pool
 * equals Σ records exactly; when everyone contributes their expected, variance is zero. Requires a
 * live RLS-enabled PostgreSQL.
 */
import { ContributionsTestKit } from './helpers/contributions-test-kit';

describe('US3 reconciliation — exact pool, zero variance (SC-005)', () => {
  const kit = new ContributionsTestKit();

  beforeAll(() => kit.setup());
  afterAll(() => kit.teardown());

  it('reconciles Σ records to the expected pool with zero variance', async () => {
    const a = await kit.profileWithOwner({ currency: 'USD' });
    const member = await kit.addMember(a.owner, a.profile.id, 'CONTRIBUTOR');

    // Owner: income 100.00 @ 50% → expected 50.00; Member: income 200.00 @ 25% → expected 50.00.
    kit.unwrapOk(await kit.contributions.setDeclaredIncome(a.owner, { sharedProfileId: a.profile.id, membershipId: a.ownerMembershipId, amountCents: 100_00n }));
    kit.unwrapOk(await kit.contributions.setAllocation(a.owner, { sharedProfileId: a.profile.id, membershipId: a.ownerMembershipId, percentageBp: 5000 }));
    kit.unwrapOk(await kit.contributions.setDeclaredIncome(member.user, { sharedProfileId: a.profile.id, membershipId: member.membershipId, amountCents: 200_00n }));
    kit.unwrapOk(await kit.contributions.setAllocation(member.user, { sharedProfileId: a.profile.id, membershipId: member.membershipId, percentageBp: 2500 }));

    // Each contributes exactly their expected (first record opens the period with a fresh snapshot).
    kit.unwrapOk(await kit.contributions.recordContribution(a.owner, { sharedProfileId: a.profile.id, membershipId: a.ownerMembershipId, amountCents: 50_00n }));
    kit.unwrapOk(await kit.contributions.recordContribution(member.user, { sharedProfileId: a.profile.id, membershipId: member.membershipId, amountCents: 50_00n }));

    const recon = await kit.tenancy.withTenant(kit.tenantId, async (tx) => {
      const period = (await kit.repo.openPeriod(tx, a.profile.id))!;
      const members = await kit.periodService.snapshotMembers(tx, period);
      const actual = await kit.repo.actualByMember(tx, period.id);
      return kit.analytics.reconcile(members, actual);
    });

    expect(recon.poolExpectedCents).toBe(100_00n);
    expect(recon.poolActualCents).toBe(100_00n);
    expect(recon.varianceCents).toBe(0n);
    expect(recon.reconciled).toBe(true);
  });
});
