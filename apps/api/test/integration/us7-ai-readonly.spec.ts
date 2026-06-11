/**
 * US7 — the coaching path produces ZERO state changes (T104 / SC-008 / FR-023). Building the read
 * model and requesting an insight write no outbox events and no audit entries. Requires a live
 * RLS-enabled PostgreSQL.
 */
import { CoachingTestKit } from './helpers/coaching-test-kit';

describe('US7 AI coaching — read-only, zero state changes (SC-008)', () => {
  const kit = new CoachingTestKit();

  beforeAll(() => kit.setup());
  afterAll(() => kit.teardown());

  it('returns advisory insights without writing any state', async () => {
    const a = await kit.profileWithOwner({ currency: 'USD' });
    kit.unwrapOk(await kit.contributions.setDeclaredIncome(a.owner, { sharedProfileId: a.profile.id, membershipId: a.ownerMembershipId, amountCents: 100_00n }));
    kit.unwrapOk(await kit.contributions.setAllocation(a.owner, { sharedProfileId: a.profile.id, membershipId: a.ownerMembershipId, percentageBp: 5000 }));
    kit.unwrapOk(await kit.contributions.recordContribution(a.owner, { sharedProfileId: a.profile.id, membershipId: a.ownerMembershipId, amountCents: 20_00n }));

    const before = await kit.stateChangeCounts(a.profile.id);

    const model = kit.unwrapOk(await kit.coachingRead.readModel(a.owner, a.profile.id));
    const insight = await kit.openRouter.coachingInsight(model);

    // Advisory output is produced…
    expect(insight.summary.length).toBeGreaterThan(0);
    expect(insight.suggestions.length).toBeGreaterThan(0);
    // …but the read model reflects the $20 of $50 expected (BEHIND), and NO state was written.
    expect(model.poolExpectedCents).toBe(50_00n);
    expect(model.poolActualCents).toBe(20_00n);

    const after = await kit.stateChangeCounts(a.profile.id);
    expect(after).toEqual(before); // SC-008: zero outbox/audit writes from the coaching path
  });
});
