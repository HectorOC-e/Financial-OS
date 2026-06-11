/**
 * Profiles module (US1) — profile governance: creation, invitations, roles, ownership transfer,
 * archival, and the invitation-expiry job. Depends only on the globally-exported foundational
 * modules (tenancy, events, permissions, scheduling), so no explicit imports are needed.
 */
import { Module } from '@nestjs/common';
import { ProfileRepository } from './infrastructure/profile.repository';
import { MembershipRepository } from './infrastructure/membership.repository';
import { ProfilesService } from './application/profiles.service';
import { InvitationExpiryJob } from './application/jobs/invitation-expiry.job';
import { ProfilesReadService } from './interface/profiles.read';
import { ProfilesResolver } from './interface/profiles.resolver';

@Module({
  providers: [
    ProfileRepository,
    MembershipRepository,
    ProfilesService,
    ProfilesReadService,
    ProfilesResolver,
    InvitationExpiryJob,
  ],
  // ProfileRepository is reused by the accounts module (personal-profile resolution).
  exports: [ProfileRepository, MembershipRepository],
})
export class ProfilesModule {}
