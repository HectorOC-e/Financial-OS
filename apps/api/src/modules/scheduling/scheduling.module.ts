import { Global, Module } from '@nestjs/common';
import { SchedulingService } from './scheduling.service';

/**
 * Scheduling module (T024). Hosts BullMQ repeatable jobs: period auto-rollover (FR-016a, T058) and
 * 14-day invitation expiry (FR-002a, T036) register themselves here in later phases.
 */
@Global()
@Module({
  providers: [SchedulingService],
  exports: [SchedulingService],
})
export class SchedulingModule {}
