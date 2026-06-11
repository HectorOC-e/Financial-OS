/**
 * Contribution event side-effects (T062/T063): cache invalidation + live subscription fan-out.
 *
 * On a ContributionRecorded / AllocationSet the derived standing/pool projections are invalidated
 * (R8) so the next read is fresh within ≤5s (SC-007), and the live `poolTotalChanged` /
 * `contributionStandingChanged` subscriptions receive the new values.
 */
import { Injectable } from '@nestjs/common';
import { CacheService } from '../../../common/cache/cache.service';
import { PubSubService } from '../../../common/pubsub/pubsub.service';
import { MoneyType } from '../../../common/graphql/money.type';
import { ContributionStandingType } from './dto/contribution.types';

export const poolTrigger = (profileId: string): string => `poolTotalChanged:${profileId}`;
export const standingTrigger = (profileId: string): string => `contributionStandingChanged:${profileId}`;

@Injectable()
export class ContributionEvents {
  constructor(
    private readonly cache: CacheService,
    private readonly pubsub: PubSubService,
  ) {}

  /** Purge cached projections for the whole profile (covers all periods). */
  async invalidate(tenantId: string, profileId: string): Promise<void> {
    await this.cache.invalidateProfile(tenantId, profileId);
  }

  publishPool(profileId: string, pool: MoneyType): void {
    this.pubsub.publish(poolTrigger(profileId), { poolTotalChanged: pool });
  }

  publishStanding(profileId: string, standing: ContributionStandingType): void {
    this.pubsub.publish(standingTrigger(profileId), { contributionStandingChanged: standing });
  }

  poolIterator(profileId: string): AsyncIterator<{ poolTotalChanged: MoneyType }> {
    return this.pubsub.asyncIterator(poolTrigger(profileId));
  }

  standingIterator(profileId: string): AsyncIterator<{ contributionStandingChanged: ContributionStandingType }> {
    return this.pubsub.asyncIterator(standingTrigger(profileId));
  }

  /** Invalidate + publish the recomputed pool (and optionally a member standing) after a write. */
  async onContributionRecorded(
    tenantId: string,
    profileId: string,
    pool: MoneyType,
    standing?: ContributionStandingType | null,
  ): Promise<void> {
    await this.invalidate(tenantId, profileId);
    this.publishPool(profileId, pool);
    if (standing) this.publishStanding(profileId, standing);
  }

  async onAllocationSet(tenantId: string, profileId: string, pool: MoneyType): Promise<void> {
    await this.invalidate(tenantId, profileId);
    this.publishPool(profileId, pool);
  }
}
