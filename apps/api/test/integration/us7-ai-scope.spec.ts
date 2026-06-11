/**
 * US7 — coaching data respects the requester's permission scope (T105 / FR-022). A non-member cannot
 * obtain coaching for a profile; a member sees only that profile's data. Requires a live RLS-enabled
 * PostgreSQL.
 */
import { DomainErrorCode } from '../../src/common/errors';
import { CoachingTestKit } from './helpers/coaching-test-kit';

describe('US7 AI coaching — permission scope (FR-022)', () => {
  const kit = new CoachingTestKit();

  beforeAll(() => kit.setup());
  afterAll(() => kit.teardown());

  it('forbids coaching for a non-member and scopes it to the caller’s profile', async () => {
    const a = await kit.profileWithOwner({ currency: 'USD' });
    const member = await kit.addMember(a.owner, a.profile.id, 'CONTRIBUTOR');
    kit.unwrapOk(await kit.contributions.setDeclaredIncome(a.owner, { sharedProfileId: a.profile.id, membershipId: a.ownerMembershipId, amountCents: 100_00n }));
    kit.unwrapOk(await kit.contributions.setAllocation(a.owner, { sharedProfileId: a.profile.id, membershipId: a.ownerMembershipId, percentageBp: 5000 }));

    // A non-member is rejected (existence not leaked beyond a FORBIDDEN scope error).
    const outsider = await kit.createUser('Outsider');
    const denied = await kit.coachingRead.readModel(outsider, a.profile.id);
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.error.code).toBe(DomainErrorCode.FORBIDDEN);

    // An ACTIVE member gets a model scoped to this profile (its members only).
    const model = kit.unwrapOk(await kit.coachingRead.readModel(member.user, a.profile.id));
    expect(model.sharedProfileId).toBe(a.profile.id);
    const ids = model.members.map((m) => m.membershipId).sort();
    expect(ids).toEqual([a.ownerMembershipId, member.membershipId].sort());
  });
});
