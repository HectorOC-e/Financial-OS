/**
 * US2 — cross-profile allocation cap (T054 / FR-015a). A member's committed percentage across all
 * their profiles may not exceed 100%; rejection reports the remaining headroom. Requires a live
 * RLS-enabled PostgreSQL.
 */
import { DomainErrorCode } from '../../src/common/errors';
import { ContributionsTestKit } from './helpers/contributions-test-kit';

describe('US2 cap — >100% across profiles rejected (FR-015a)', () => {
  const kit = new ContributionsTestKit();

  beforeAll(() => kit.setup());
  afterAll(() => kit.teardown());

  it('rejects an allocation that would exceed 100% and returns remaining headroom', async () => {
    // Profile A: the user is owner and commits 70%.
    const a = await kit.profileWithOwner({ currency: 'USD' });
    kit.unwrapOk(
      await kit.contributions.setAllocation(a.owner, {
        sharedProfileId: a.profile.id,
        membershipId: a.ownerMembershipId,
        percentageBp: 7000,
      }),
    );
    expect(await kit.contributions.remainingAllocationPercentageBp(a.owner)).toBe(3000);

    // Profile B: another owner invites the same user, who tries to commit 40% (7000 + 4000 > 100%).
    const ownerB = await kit.createUser('OwnerB');
    const profileB = kit.unwrapOk(
      await kit.service.createSharedProfile(ownerB, { name: 'B', baseCurrency: 'USD', periodLength: 'MONTHLY' }),
    );
    const inviteU = kit.unwrapOk(
      await kit.service.inviteMember(ownerB, { sharedProfileId: profileB.id, userId: a.owner.userId, role: 'CONTRIBUTOR' }),
    );
    kit.unwrapOk(await kit.service.acceptInvitation(a.owner, inviteU.id));

    const result = await kit.contributions.setAllocation(a.owner, {
      sharedProfileId: profileB.id,
      membershipId: inviteU.id,
      percentageBp: 4000,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(DomainErrorCode.CAP_EXCEEDED);
      expect(result.error.details).toMatchObject({ remainingBp: 3000 });
    }

    // Within headroom (30%) is accepted.
    kit.unwrapOk(
      await kit.contributions.setAllocation(a.owner, {
        sharedProfileId: profileB.id,
        membershipId: inviteU.id,
        percentageBp: 3000,
      }),
    );
    expect(await kit.contributions.remainingAllocationPercentageBp(a.owner)).toBe(0);
  });
});
