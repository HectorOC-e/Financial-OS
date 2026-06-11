/**
 * Profile repository (T034) — shared & personal profiles. Tenant-scoped via the ambient RLS GUC;
 * every method runs inside a caller-supplied tenant transaction. SharedProfile carries no `version`
 * column (its only mutation, archival, is a one-way status change), so no optimistic lock here.
 */
import { Injectable } from '@nestjs/common';
import type { PersonalProfile, PeriodLength, SharedProfile } from '@prisma/client';
import type { TenantTx } from '../../tenancy/tenancy.service';
import type { SharedProfileState } from '../domain/entities/shared-profile';

export function toSharedProfileState(row: SharedProfile): SharedProfileState {
  return { id: row.id, status: row.status, ownerMembershipId: row.ownerMembershipId };
}

export interface CreateSharedProfileData {
  name: string;
  baseCurrency: string;
  periodLength: PeriodLength;
}

@Injectable()
export class ProfileRepository {
  createSharedProfile(tx: TenantTx, tenantId: string, data: CreateSharedProfileData): Promise<SharedProfile> {
    return tx.sharedProfile.create({
      data: {
        tenantId,
        name: data.name,
        baseCurrency: data.baseCurrency.toUpperCase(),
        periodLength: data.periodLength,
      },
    });
  }

  findSharedProfile(tx: TenantTx, id: string): Promise<SharedProfile | null> {
    return tx.sharedProfile.findUnique({ where: { id } });
  }

  async setOwnerMembershipId(tx: TenantTx, id: string, ownerMembershipId: string): Promise<void> {
    await tx.sharedProfile.update({ where: { id }, data: { ownerMembershipId } });
  }

  async archive(tx: TenantTx, id: string, archivedAt: Date): Promise<void> {
    await tx.sharedProfile.update({ where: { id }, data: { status: 'ARCHIVED', archivedAt } });
  }

  /** One personal profile per user (data-model). Created lazily the first time it is needed. */
  async findOrCreatePersonalProfile(tx: TenantTx, tenantId: string, userId: string): Promise<PersonalProfile> {
    const existing = await tx.personalProfile.findUnique({ where: { userId } });
    if (existing) return existing;
    return tx.personalProfile.create({ data: { tenantId, userId } });
  }
}
