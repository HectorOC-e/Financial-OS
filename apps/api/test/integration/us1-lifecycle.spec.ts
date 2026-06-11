/**
 * US1 — invitation decline + 14-day expiry; archived profile is read-only (T044 / FR-002a / FR-007c).
 * Requires a live RLS-enabled PostgreSQL.
 */
import { DomainErrorCode } from '../../src/common/errors';
import { OutboxWriter } from '../../src/modules/events/outbox/outbox.writer';
import { AuditWriter } from '../../src/modules/permissions/audit/audit.writer';
import { InvitationExpiryJob } from '../../src/modules/profiles/application/jobs/invitation-expiry.job';
import { ProfilesTestKit } from './helpers/profiles-test-kit';

const noopLogger = { info() {}, warn() {}, error() {}, debug() {} } as never;
const noopScheduling = { register() {} } as never;

describe('US1 lifecycle — decline, expiry, archive (FR-002a / FR-007c)', () => {
  const kit = new ProfilesTestKit();

  beforeAll(() => kit.setup());
  afterAll(() => kit.teardown());

  it('declines a pending invitation (INVITED → DECLINED)', async () => {
    const owner = await kit.createUser('Owner');
    const invitee = await kit.createUser('Invitee');
    const profile = kit.unwrapOk(
      await kit.service.createSharedProfile(owner, { name: 'D', baseCurrency: 'USD', periodLength: 'MONTHLY' }),
    );
    const invite = kit.unwrapOk(
      await kit.service.inviteMember(owner, { sharedProfileId: profile.id, userId: invitee.userId, role: 'CONTRIBUTOR' }),
    );

    const declined = kit.unwrapOk(await kit.service.declineInvitation(invitee, invite.id));
    expect(declined.status).toBe('DECLINED');
  });

  it('expires an unanswered invitation past its 14-day deadline (INVITED → EXPIRED)', async () => {
    const owner = await kit.createUser('Owner2');
    const invitee = await kit.createUser('Invitee2');
    const profile = kit.unwrapOk(
      await kit.service.createSharedProfile(owner, { name: 'E', baseCurrency: 'USD', periodLength: 'MONTHLY' }),
    );
    const invite = kit.unwrapOk(
      await kit.service.inviteMember(owner, { sharedProfileId: profile.id, userId: invitee.userId, role: 'CONTRIBUTOR' }),
    );

    // Backdate the deadline so the sweep considers it due.
    await kit.tenancy.withTenant(kit.tenantId, (tx) =>
      tx.membership.update({ where: { id: invite.id }, data: { invitationExpiresAt: new Date(Date.now() - 1000) } }),
    );

    const job = new InvitationExpiryJob(kit.prisma, kit.tenancy, new OutboxWriter(), new AuditWriter(), noopScheduling, noopLogger);
    const expired = await job.runForTenant(kit.tenantId);
    expect(expired).toBeGreaterThanOrEqual(1);

    const row = await kit.tenancy.withTenant(kit.tenantId, (tx) => tx.membership.findUnique({ where: { id: invite.id } }));
    expect(row?.status).toBe('EXPIRED');

    const events = await kit.tenancy.withTenant(kit.tenantId, (tx) =>
      tx.outboxEvent.count({ where: { aggregateId: invite.id, eventType: 'InvitationExpired' } }),
    );
    expect(events).toBe(1);
  });

  it('makes an archived profile read-only (FR-007c)', async () => {
    const owner = await kit.createUser('SoleOwner');
    const target = await kit.createUser('WouldBeMember');
    const profile = kit.unwrapOk(
      await kit.service.createSharedProfile(owner, { name: 'A', baseCurrency: 'USD', periodLength: 'MONTHLY' }),
    );

    const archived = kit.unwrapOk(await kit.service.archiveProfile(owner, profile.id));
    expect(archived.status).toBe('ARCHIVED');

    // No further writes are accepted on an archived profile.
    const blocked = await kit.service.inviteMember(owner, {
      sharedProfileId: profile.id,
      userId: target.userId,
      role: 'CONTRIBUTOR',
    });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.error.code).toBe(DomainErrorCode.ARCHIVED);
  });
});
