/**
 * Contributions module (US2/US3) — income declaration, percentage allocation with the cross-profile
 * cap, contribution recording, periods with auto-rollover, standings, and live pool/standing
 * subscriptions. Relies on the global foundational modules (tenancy, events, permissions, scheduling,
 * cache); provides its own analytics seam, pub/sub, and read model.
 */
import { Module } from '@nestjs/common';
import { PubSubService } from '../../common/pubsub/pubsub.service';
import { AnalyticsService } from './domain/analytics/analytics.service';
import { ContributionRepository } from './infrastructure/contribution.repository';
import { PeriodService } from './application/period.service';
import { ContributionsService } from './application/contributions.service';
import { PeriodRolloverJob } from './application/jobs/period-rollover.job';
import { ContributionsReadService } from './interface/contributions.read';
import { ContributionEvents } from './interface/contribution-events';
import {
  ContributionsResolver,
  MembershipContributionsResolver,
  ContributionSubscriptionsResolver,
} from './interface/contributions.resolver';

@Module({
  providers: [
    PubSubService,
    AnalyticsService,
    ContributionRepository,
    PeriodService,
    ContributionsService,
    ContributionsReadService,
    ContributionEvents,
    PeriodRolloverJob,
    ContributionsResolver,
    MembershipContributionsResolver,
    ContributionSubscriptionsResolver,
  ],
  // Reused by the accounts module (contribute-from-account) and ai-coaching (read-only analytics).
  exports: [ContributionRepository, PeriodService, AnalyticsService],
})
export class ContributionsModule {}
