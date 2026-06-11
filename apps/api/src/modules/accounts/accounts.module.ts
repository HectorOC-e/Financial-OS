/**
 * Accounts module (US6) — isolated personal accounts and the contribute-from-account flow. Reuses the
 * profiles module (personal-profile resolution) and contributions module (period + record) to make a
 * contribution move only the contributed amount into the pool, atomically.
 */
import { Module } from '@nestjs/common';
import { ProfilesModule } from '../profiles/profiles.module';
import { ContributionsModule } from '../contributions/contributions.module';
import { AccountRepository } from './infrastructure/account.repository';
import { AccountsService } from './application/accounts.service';
import { AccountsResolver } from './interface/accounts.resolver';

@Module({
  imports: [ProfilesModule, ContributionsModule],
  providers: [AccountRepository, AccountsService, AccountsResolver],
})
export class AccountsModule {}
