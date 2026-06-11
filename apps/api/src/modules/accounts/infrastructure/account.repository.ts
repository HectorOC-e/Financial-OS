/**
 * Account repository (T094). Tenant-scoped via the ambient RLS GUC. Accounts have no `version`
 * column (balance changes here are simple debits within a transaction that also records the matching
 * contribution), so updates are plain. Every method runs inside a caller-supplied tenant transaction.
 */
import { Injectable } from '@nestjs/common';
import type { Account, AccountType, ProfileType } from '@prisma/client';
import type { TenantTx } from '../../tenancy/tenancy.service';

export interface CreateAccountData {
  profileType: ProfileType;
  profileId: string;
  type: AccountType;
  name: string;
  balance: bigint;
  currency: string;
}

@Injectable()
export class AccountRepository {
  create(tx: TenantTx, tenantId: string, data: CreateAccountData): Promise<Account> {
    return tx.account.create({
      data: {
        tenantId,
        profileType: data.profileType,
        profileId: data.profileId,
        type: data.type,
        name: data.name,
        balance: data.balance,
        currency: data.currency.toUpperCase(),
      },
    });
  }

  findById(tx: TenantTx, id: string): Promise<Account | null> {
    return tx.account.findUnique({ where: { id } });
  }

  /** Accounts belonging to a given profile (personal or shared). */
  listByProfile(tx: TenantTx, profileType: ProfileType, profileId: string): Promise<Account[]> {
    return tx.account.findMany({ where: { profileType, profileId }, orderBy: { createdAt: 'asc' } });
  }

  async setBalance(tx: TenantTx, id: string, balance: bigint): Promise<void> {
    await tx.account.update({ where: { id }, data: { balance } });
  }
}
