/**
 * US5 — debt responsibilities reassign proportionally and still sum to 100% after a member leaves
 * (T089 / FR-020a). Requires a live RLS-enabled PostgreSQL.
 */
import { SharedElementsTestKit } from './helpers/shared-elements-test-kit';

function sum(map: Map<string, number>): number {
  return [...map.values()].reduce((s, v) => s + v, 0);
}

describe('US5 reassignment — proportional on leave (FR-020a)', () => {
  const kit = new SharedElementsTestKit();

  beforeAll(() => kit.setup());
  afterAll(() => kit.teardown());

  it('defaults to contribution %, then reassigns a leaver’s share proportionally', async () => {
    const a = await kit.profileWithOwner({ currency: 'USD' });
    const m1 = await kit.addMember(a.owner, a.profile.id, 'CONTRIBUTOR');
    const m2 = await kit.addMember(a.owner, a.profile.id, 'CONTRIBUTOR');

    // Contributions 50% / 30% / 20% → default debt responsibilities mirror them.
    kit.unwrapOk(await kit.contributions.setAllocation(a.owner, { sharedProfileId: a.profile.id, membershipId: a.ownerMembershipId, percentageBp: 5000 }));
    kit.unwrapOk(await kit.contributions.setAllocation(m1.user, { sharedProfileId: a.profile.id, membershipId: m1.membershipId, percentageBp: 3000 }));
    kit.unwrapOk(await kit.contributions.setAllocation(m2.user, { sharedProfileId: a.profile.id, membershipId: m2.membershipId, percentageBp: 2000 }));

    const debt = kit.unwrapOk(await kit.elements.createSharedDebt(a.owner, a.profile.id, 'DEBT', 'Loan', 300_00n));
    const initial = await kit.responsibilities(debt.id);
    expect(sum(initial)).toBe(10000);
    expect(initial.get(a.ownerMembershipId)).toBe(5000);
    expect(initial.get(m1.membershipId)).toBe(3000);
    expect(initial.get(m2.membershipId)).toBe(2000);

    // m1 leaves; their 30% is reassigned to owner+m2 in proportion to 50:20.
    kit.unwrapOk(await kit.service.leaveProfile(m1.user, m1.membershipId));
    const changed = await kit.reassign.reassignForLeftMember(kit.tenantId, a.profile.id, m1.membershipId);
    expect(changed).toBe(1);

    const after = await kit.responsibilities(debt.id);
    expect(after.has(m1.membershipId)).toBe(false);
    expect(sum(after)).toBe(10000);
    // 50:20 of 10000 via largest remainder → 7143 / 2857.
    expect(after.get(a.ownerMembershipId)).toBe(7143);
    expect(after.get(m2.membershipId)).toBe(2857);
  });
});
