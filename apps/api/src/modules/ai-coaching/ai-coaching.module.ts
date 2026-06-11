/**
 * AI coaching module (US7) — a strictly READ-ONLY coaching surface (Principle III). Reuses the
 * contributions module's read-only analytics; the OpenRouter client and projection consumer hold no
 * write collaborators and can never mutate financial state.
 */
import { Module } from '@nestjs/common';
import { ContributionsModule } from '../contributions/contributions.module';
import { CoachingReadService } from './application/coaching-read.service';
import { CoachingProjectionConsumer } from './application/coaching-projection.consumer';
import { OpenRouterClient } from './infrastructure/openrouter.client';
import { CoachingResolver } from './interface/coaching.resolver';

@Module({
  imports: [ContributionsModule],
  providers: [CoachingReadService, OpenRouterClient, CoachingProjectionConsumer, CoachingResolver],
})
export class AiCoachingModule {}
