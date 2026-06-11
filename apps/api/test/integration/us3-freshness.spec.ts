/**
 * US3 — standing reflects a new contribution within 5 seconds (T065 / SC-007). With event-driven
 * invalidation the read model is authoritative immediately; this asserts the standing updates well
 * under the 5s ceiling. Requires a live RLS-enabled PostgreSQL.
 */
import { ContributionsTestKit } from './helpers/contributions-test-kit';

describe('US3 freshness — standing updates ≤5s (SC-007)', () => {
  const kit = new ContributionsTestKit();

  beforeAll(() => kit.setup());
  afterAll(() => kit.teardown());

  it('reflects a just-recorded contribution in the member standing within the freshness window', async () => {
    const a = await kit.profileWithOwner({ currency: 'USD' });
    kit.unwrapOk(await kit.contributions.setDeclaredIncome(a.owner, { sharedProfileId: a.profile.id, membershipId: a.ownerMembershipId, amountCents: 100_00n }));
    kit.unwrapOk(await kit.contributions.setAllocation(a.owner, { sharedProfileId: a.profile.id, membershipId: a.ownerMembershipId, percentageBp: 5000 }));

    // Open the period and establish a baseline standing (expected 50.00, actual 0 → BEHIND).
    kit.unwrapOk(await kit.contributions.recordContribution(a.owner, { sharedProfileId: a.profile.id, membershipId: a.ownerMembershipId, amountCents: 20_00n }));
    const before = await kit.cread.standingByMembershipId(a.owner, a.ownerMembershipId);
    expect(before?.actual.amountCents).toBe(20_00n);

    const start = Date.now();
    kit.unwrapOk(await kit.contributions.recordContribution(a.owner, { sharedProfileId: a.profile.id, membershipId: a.ownerMembershipId, amountCents: 30_00n }));
    const after = await kit.cread.standingByMembershipId(a.owner, a.ownerMembershipId);
    const elapsedMs = Date.now() - start;

    expect(after?.actual.amountCents).toBe(50_00n); // 20.00 + 30.00
    expect(after?.state).toBe('ON_TRACK'); // meets expected 50.00 exactly
    expect(elapsedMs).toBeLessThan(5000);
  });
});
