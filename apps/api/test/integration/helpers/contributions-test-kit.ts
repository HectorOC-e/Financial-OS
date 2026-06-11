/**
 * Integration test kit for US2/US3 (T054/T064/T065/T066). Composes the profiles kit (to create
 * profiles + members) with the contribution services, all sharing one Prisma connection / tenant.
 * Requires a live RLS-enabled PostgreSQL.
 */
import { OutboxWriter } from '../../../src/modules/events/outbox/outbox.writer';
import { AuditWriter } from '../../../src/modules/permissions/audit/audit.writer';
import { ContributionRepository } from '../../../src/modules/contributions/infrastructure/contribution.repository';
import { PeriodService } from '../../../src/modules/contributions/application/period.service';
import { ContributionsService } from '../../../src/modules/contributions/application/contributions.service';
import { ContributionsReadService } from '../../../src/modules/contributions/interface/contributions.read';
import { PeriodRolloverJob } from '../../../src/modules/contributions/application/jobs/period-rollover.job';
import { AnalyticsService } from '../../../src/modules/contributions/domain/analytics/analytics.service';
import { ProfilesTestKit } from './profiles-test-kit';

const noopLogger = { info() {}, warn() {}, error() {}, debug() {} } as never;
const noopScheduling = { register() {} } as never;

export class ContributionsTestKit extends ProfilesTestKit {
  readonly repo = new ContributionRepository();
  readonly analytics = new AnalyticsService();
  readonly periodService = new PeriodService(this.tenancy, this.repo, new OutboxWriter());
  readonly contributions = new ContributionsService(
    this.tenancy,
    this.repo,
    this.periodService,
    new OutboxWriter(),
    new AuditWriter(),
  );
  readonly cread = new ContributionsReadService(this.tenancy, this.repo, this.periodService, this.analytics);
  readonly rolloverJob = new PeriodRolloverJob(this.prisma, this.periodService, noopScheduling, noopLogger);

  /** Create an OWNER-led profile and return ids for the owner membership. */
  async profileWithOwner(opts: { currency?: string; periodLength?: 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY' } = {}) {
    const owner = await this.createUser('Owner');
    const profile = this.unwrapOk(
      await this.service.createSharedProfile(owner, {
        name: 'Pool',
        baseCurrency: opts.currency ?? 'USD',
        periodLength: opts.periodLength ?? 'MONTHLY',
      }),
    );
    const ownerMembership = await this.tenancy.withTenant(this.tenantId, (tx) =>
      tx.membership.findFirstOrThrow({ where: { sharedProfileId: profile.id, userId: owner.userId } }),
    );
    return { owner, profile, ownerMembershipId: ownerMembership.id };
  }

  /** Invite + accept a member, returning their principal + membership id. */
  async addMember(ownerPrincipal: import('../../../src/modules/tenancy/tenant-context').TenantPrincipal, profileId: string, role: 'ADMIN' | 'CONTRIBUTOR' | 'VIEWER' = 'CONTRIBUTOR') {
    const user = await this.createUser('Member');
    const invite = this.unwrapOk(await this.service.inviteMember(ownerPrincipal, { sharedProfileId: profileId, userId: user.userId, role }));
    this.unwrapOk(await this.service.acceptInvitation(user, invite.id));
    return { user, membershipId: invite.id };
  }
}
