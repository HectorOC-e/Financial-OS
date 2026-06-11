/**
 * US5 — a contribution shortfall does NOT block goal funding or debt payment (T088 / FR-019). Money
 * integrity is enforced per element, never gated on the pool being fully funded. Requires a live
 * RLS-enabled PostgreSQL.
 */
import { SharedElementsTestKit } from './helpers/shared-elements-test-kit';

describe('US5 shortfall — non-blocking spending (FR-019)', () => {
  const kit = new SharedElementsTestKit();

  beforeAll(() => kit.setup());
  afterAll(() => kit.teardown());

  it('funds a goal and pays a debt even when contributions fall short of expected', async () => {
    const a = await kit.profileWithOwner({ currency: 'USD' });
    // Expected pool 50.00 (100.00 @ 50%) but the owner only contributes 5.00 → shortfall of 45.00.
    kit.unwrapOk(await kit.contributions.setDeclaredIncome(a.owner, { sharedProfileId: a.profile.id, membershipId: a.ownerMembershipId, amountCents: 100_00n }));
    kit.unwrapOk(await kit.contributions.setAllocation(a.owner, { sharedProfileId: a.profile.id, membershipId: a.ownerMembershipId, percentageBp: 5000 }));
    kit.unwrapOk(await kit.contributions.recordContribution(a.owner, { sharedProfileId: a.profile.id, membershipId: a.ownerMembershipId, amountCents: 5_00n }));

    const goal = kit.unwrapOk(await kit.elements.createSharedGoal(a.owner, a.profile.id, 'Trip', 1_000_00n));
    const debt = kit.unwrapOk(await kit.elements.createSharedDebt(a.owner, a.profile.id, 'DEBT', 'Loan', 500_00n));

    // Despite the shortfall, funding and payment succeed (shortfall is tracked, never blocks).
    const funded = kit.unwrapOk(await kit.elements.fundGoal(a.owner, goal.id, 200_00n, goal.version));
    expect(funded.fundedAmount).toBe(200_00n);
    const paid = kit.unwrapOk(await kit.elements.paySharedDebt(a.owner, debt.id, 100_00n, debt.version));
    expect(paid.outstandingBalance).toBe(400_00n);
  });
});
