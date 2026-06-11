/**
 * US1 — Viewer write rejected with no state change (T041 / SC-003 / FR-006).
 * Requires a live PostgreSQL with migrations + RLS applied (non-superuser app role).
 */
import { DomainErrorCode } from '../../src/common/errors';
import { ProfilesTestKit } from './helpers/profiles-test-kit';

describe('US1 permissions — Viewer cannot mutate (SC-003)', () => {
  const kit = new ProfilesTestKit();

  beforeAll(() => kit.setup());
  afterAll(() => kit.teardown());

  it('rejects a Viewer invite with FORBIDDEN and changes no state', async () => {
    const owner = await kit.createUser('Owner');
    const viewer = await kit.createUser('Viewer');
    const target = await kit.createUser('Target');

    const profile = kit.unwrapOk(
      await kit.service.createSharedProfile(owner, { name: 'House', baseCurrency: 'USD', periodLength: 'MONTHLY' }),
    );
    const invite = kit.unwrapOk(
      await kit.service.inviteMember(owner, { sharedProfileId: profile.id, userId: viewer.userId, role: 'VIEWER' }),
    );
    kit.unwrapOk(await kit.service.acceptInvitation(viewer, invite.id));

    const before = await kit.stateChangeCounts(profile.id);

    // Viewer attempts to invite — must be rejected by the capability matrix.
    const result = await kit.service.inviteMember(viewer, {
      sharedProfileId: profile.id,
      userId: target.userId,
      role: 'CONTRIBUTOR',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(DomainErrorCode.FORBIDDEN);

    // No membership was created for the target, and no new audit/outbox rows were written.
    const after = await kit.stateChangeCounts(profile.id);
    expect(after).toEqual(before);
    const members = await kit.read.sharedProfile(owner, profile.id);
    expect(members?.members.some((m) => m.user.id === target.userId)).toBe(false);
  });
});
