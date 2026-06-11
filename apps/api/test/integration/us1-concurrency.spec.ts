/**
 * US1 — stale-version mutation returns CONFLICT (T043 / FR-006a).
 * Optimistic concurrency on Membership: a role change against a superseded `expectedVersion` is
 * rejected with no lost update. Requires a live RLS-enabled PostgreSQL.
 */
import { DomainErrorCode } from '../../src/common/errors';
import { ProfilesTestKit } from './helpers/profiles-test-kit';

describe('US1 concurrency — optimistic version guard (FR-006a)', () => {
  const kit = new ProfilesTestKit();

  beforeAll(() => kit.setup());
  afterAll(() => kit.teardown());

  it('rejects a role change made against a stale version', async () => {
    const owner = await kit.createUser('Owner');
    const member = await kit.createUser('Member');

    const profile = kit.unwrapOk(
      await kit.service.createSharedProfile(owner, { name: 'Flat', baseCurrency: 'USD', periodLength: 'MONTHLY' }),
    );
    const invite = kit.unwrapOk(
      await kit.service.inviteMember(owner, { sharedProfileId: profile.id, userId: member.userId, role: 'VIEWER' }),
    );
    const accepted = kit.unwrapOk(await kit.service.acceptInvitation(member, invite.id));
    const staleVersion = accepted.version;

    // First change with the current version succeeds and bumps the version.
    const first = kit.unwrapOk(await kit.service.changeMemberRole(owner, accepted.id, 'CONTRIBUTOR', staleVersion));
    expect(first.role).toBe('CONTRIBUTOR');
    expect(first.version).toBe(staleVersion + 1);

    // Second change reusing the now-stale version must conflict and not apply.
    const conflict = await kit.service.changeMemberRole(owner, accepted.id, 'ADMIN', staleVersion);
    expect(conflict.ok).toBe(false);
    if (!conflict.ok) expect(conflict.error.code).toBe(DomainErrorCode.CONFLICT);

    const after = await kit.read.membershipById(owner, accepted.id);
    expect(after.role).toBe('CONTRIBUTOR'); // unchanged by the rejected mutation
  });
});
