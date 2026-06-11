/**
 * Shared-elements module (US5) — goals, debts/credit cards with per-member responsibilities,
 * investments, and period-scoped budgets, with money-integrity and optimistic-concurrency rules.
 * Hooks MemberLeft to reassign debt responsibilities proportionally (FR-020a). Relies on the global
 * foundational modules (tenancy, events, permissions).
 */
import { Module } from '@nestjs/common';
import { SharedElementsRepository } from './infrastructure/shared-elements.repository';
import { SharedElementsService } from './application/shared-elements.service';
import { DebtReassignmentConsumer } from './application/debt-reassignment.consumer';
import { SharedElementsReadService } from './interface/shared-elements.read';
import { SharedElementsResolver } from './interface/shared-elements.resolver';

@Module({
  providers: [
    SharedElementsRepository,
    SharedElementsService,
    DebtReassignmentConsumer,
    SharedElementsReadService,
    SharedElementsResolver,
  ],
})
export class SharedElementsModule {}
