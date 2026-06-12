/**
 * Personal-account use cases (T094/T096 — US6/FR-010/FR-010a). Orchestration only.
 *
 * Personal accounts are tenant + user scoped and isolated from shared profiles. Contributing from an
 * account moves ONLY the contributed amount into the shared pool (as a ContributionRecord) and debits
 * the account by that same amount — the rest of the balance stays personal. The debit and the pool
 * record commit in one transaction (atomic), and the contribution is emitted via the outbox.
 */
import { Injectable } from '@nestjs/common';
import type { Account, AccountType, ContributionRecord } from '@prisma/client';
import { DomainError, Result, ok, err, isErr } from '../../../common/errors';
import { TenancyService } from '../../tenancy/tenancy.service';
import { OutboxWriter } from '../../events/outbox/outbox.writer';
import { EventType } from '../../events/event-envelope';
import { AuditWriter } from '../../permissions/audit/audit.writer';
import { Capability, can } from '../../permissions/capability-matrix';
import type { TenantPrincipal } from '../../tenancy/tenant-context';
import { ProfileRepository } from '../../profiles/infrastructure/profile.repository';
import { ContributionRepository } from '../../contributions/infrastructure/contribution.repository';
import { PeriodService } from '../../contributions/application/period.service';
import { ensureProfileCurrency } from '../../shared-elements/domain/currency-guard';
import { AccountRepository } from '../infrastructure/account.repository';
import { validateOpeningBalance, withdrawForContribution } from '../domain/account';

export interface CreatePersonalAccountInput {
  type: AccountType;
  name: string;
  currency: string;
  openingBalanceCents: bigint;
}
export interface ContributeFromAccountInput {
  accountId: string;
  sharedProfileId: string;
  membershipId: string;
  amountCents: bigint;
}

@Injectable()
export class AccountsService {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly accounts: AccountRepository,
    private readonly profiles: ProfileRepository,
    private readonly contributions: ContributionRepository,
    private readonly periods: PeriodService,
    private readonly outbox: OutboxWriter,
    private readonly audit: AuditWriter,
  ) {}

  createPersonalAccount(principal: TenantPrincipal, input: CreatePersonalAccountInput): Promise<Result<Account>> {
    return this.tenancy.withTenant(principal.tenantId, async (tx) => {
      const balanceCheck = validateOpeningBalance(input.openingBalanceCents);
      if (isErr(balanceCheck)) return balanceCheck;
      const personal = await this.profiles.findOrCreatePersonalProfile(tx, principal.tenantId, principal.userId);
      const account = await this.accounts.create(tx, principal.tenantId, {
        profileType: 'PERSONAL',
        profileId: personal.id,
        type: input.type,
        name: input.name,
        balance: input.openingBalanceCents,
        currency: input.currency,
      });
      return ok(account);
    });
  }

  listPersonalAccounts(principal: TenantPrincipal): Promise<Account[]> {
    return this.tenancy.withTenant(principal.tenantId, async (tx) => {
      const personal = await this.profiles.findOrCreatePersonalProfile(tx, principal.tenantId, principal.userId);
      return this.accounts.listByProfile(tx, 'PERSONAL', personal.id);
    });
  }

  /** Accounts for a personal profile, but only when the requester owns it (FR-004/FR-010). */
  accountsForOwnedProfile(principal: TenantPrincipal, personalProfileId: string): Promise<Account[]> {
    return this.tenancy.withTenant(principal.tenantId, async (tx) => {
      const personal = await tx.personalProfile.findUnique({ where: { id: personalProfileId } });
      if (!personal || personal.userId !== principal.userId) return [];
      return this.accounts.listByProfile(tx, 'PERSONAL', personalProfileId);
    });
  }

  contributeFromAccount(principal: TenantPrincipal, input: ContributeFromAccountInput): Promise<Result<{ account: Account; record: ContributionRecord }>> {
    return this.tenancy.withTenant(principal.tenantId, async (tx) => {
      const personal = await this.profiles.findOrCreatePersonalProfile(tx, principal.tenantId, principal.userId);
      const account = await this.accounts.findById(tx, input.accountId);
      if (!account || account.profileType !== 'PERSONAL' || account.profileId !== personal.id) {
        return err(DomainError.notFound('Account not found'));
      }

      // The contributing membership must belong to the caller, be ACTIVE, and permit contributions.
      const membership = await tx.membership.findUnique({
        where: { sharedProfileId_userId: { sharedProfileId: input.sharedProfileId, userId: principal.userId } },
      });
      if (!membership || membership.id !== input.membershipId || membership.status !== 'ACTIVE') {
        return err(DomainError.forbidden('You can only contribute on your own active membership'));
      }
      if (!can(membership.role, Capability.RECORD_CONTRIBUTION)) {
        return err(DomainError.forbidden('Your role does not permit recording contributions', { role: membership.role }));
      }

      const profile = await tx.sharedProfile.findUnique({ where: { id: input.sharedProfileId } });
      if (!profile) return err(DomainError.notFound('Shared profile not found'));
      if (profile.status !== 'ACTIVE') return err(DomainError.archived());

      // Single currency per profile (T111/CHK041): a personal account in another currency cannot
      // contribute — no implicit conversion ever happens.
      const sameCurrency = ensureProfileCurrency(profile.baseCurrency, account.currency, { accountId: account.id });
      if (isErr(sameCurrency)) return sameCurrency;

      const withdrawal = withdrawForContribution(account.balance, input.amountCents);
      if (isErr(withdrawal)) return withdrawal;

      // Debit only the contributed amount; the remaining balance stays personal (FR-010).
      await this.accounts.setBalance(tx, account.id, withdrawal.value.newBalanceCents);

      const period = await this.periods.ensureOpenPeriod(tx, principal.tenantId, profile, new Date());
      const record = await this.contributions.createRecord(tx, principal.tenantId, {
        sharedProfileId: input.sharedProfileId,
        periodId: period.id,
        membershipId: input.membershipId,
        amount: input.amountCents,
        sourceAccountId: account.id,
      });

      await this.outbox.write(tx, principal.tenantId, {
        eventType: EventType.ContributionRecorded,
        aggregateType: 'ContributionRecord',
        aggregateId: record.id,
        actorMembershipId: input.membershipId,
        payload: {
          sharedProfileId: input.sharedProfileId,
          periodId: period.id,
          membershipId: input.membershipId,
          amountCents: input.amountCents.toString(),
          sourceAccountId: account.id,
        },
      });
      await this.audit.write(tx, principal.tenantId, {
        sharedProfileId: input.sharedProfileId,
        actorMembershipId: input.membershipId,
        action: 'ContributionRecorded',
        afterValue: { periodId: period.id, amountCents: input.amountCents.toString(), sourceAccountId: account.id },
      });

      const reloaded = (await this.accounts.findById(tx, account.id))!;
      return ok({ account: reloaded, record });
    });
  }
}
