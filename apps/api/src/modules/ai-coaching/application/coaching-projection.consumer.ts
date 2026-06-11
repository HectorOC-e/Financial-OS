/**
 * Coaching read-model refresh consumer (T103 — Principle III/FR-023/SC-008).
 *
 * Subscribes to ContributionRecorded / PercentageRedistributed and refreshes the coaching read model
 * by invalidating its cached projection so the next coaching request recomputes from fresh analytics.
 * It is strictly READ-ONLY: it emits no commands and writes no financial state — only a cache eviction.
 */
import { Injectable, OnModuleInit } from '@nestjs/common';
import { CacheService } from '../../../common/cache/cache.service';
import { EventHandler, EventRegistry } from '../../events/registry/event-registry';
import { DomainEventEnvelope, EventType } from '../../events/event-envelope';

@Injectable()
export class CoachingProjectionConsumer implements EventHandler, OnModuleInit {
  readonly name = 'coaching-projection';
  readonly eventTypes = [EventType.ContributionRecorded, EventType.PercentageRedistributed];

  constructor(
    private readonly registry: EventRegistry,
    private readonly cache: CacheService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async handle(envelope: DomainEventEnvelope): Promise<void> {
    const profileId = typeof envelope.payload.sharedProfileId === 'string' ? envelope.payload.sharedProfileId : null;
    if (!profileId) return;
    // Read-only refresh: evict the derived projection cache (no domain writes, no events emitted).
    await this.cache.invalidateProfile(envelope.tenantId, profileId);
  }
}
