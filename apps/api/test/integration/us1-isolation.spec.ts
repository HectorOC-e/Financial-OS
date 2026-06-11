/**
 * US1 — cross-member personal-account isolation (T042 / SC-004 / FR-004).
 * A member's personal profile/accounts are never exposed to other members; only the caller's own
 * personal profile is attached to their `me` user. Requires a live RLS-enabled PostgreSQL.
 */
import { ProfilesTestKit } from './helpers/profiles-test-kit';

describe('US1 isolation — personal profiles are private (SC-004)', () => {
  const kit = new ProfilesTestKit();

  beforeAll(() => kit.setup());
  afterAll(() => kit.teardown());

  it('does not expose other members’ personal profiles, but exposes the caller’s own', async () => {
    const owner = await kit.createUser('Owner');
    const member = await kit.createUser('Member');

    const profile = kit.unwrapOk(
      await kit.service.createSharedProfile(owner, { name: 'Couple', baseCurrency: 'EUR', periodLength: 'MONTHLY' }),
    );
    const invite = kit.unwrapOk(
      await kit.service.inviteMember(owner, { sharedProfileId: profile.id, userId: member.userId, role: 'CONTRIBUTOR' }),
    );
    kit.unwrapOk(await kit.service.acceptInvitation(member, invite.id));

    // Owner views the profile: no member's user carries a personalProfile (FR-004).
    const asOwner = await kit.read.sharedProfile(owner, profile.id);
    expect(asOwner).not.toBeNull();
    expect(asOwner!.members.length).toBe(2);
    for (const m of asOwner!.members) {
      expect(m.user.personalProfile ?? null).toBeNull();
    }

    // Each caller can see only their OWN personal profile via `me`.
    const meMember = await kit.read.me(member);
    expect(meMember.id).toBe(member.userId);
    expect(meMember.personalProfile).not.toBeNull();
    expect(meMember.personalProfile!.accounts).toEqual([]);

    // A non-member cannot view the profile at all (existence not leaked).
    const outsider = await kit.createUser('Outsider');
    expect(await kit.read.sharedProfile(outsider, profile.id)).toBeNull();
  });
});
