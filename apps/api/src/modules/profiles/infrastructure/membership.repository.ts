/**
 * Membership repository (T034). Tenant-scoped (RLS via the ambient GUC) and version-aware for the
 * one membership mutation that carries optimistic concurrency — changeMemberRole (FR-006a). Every
 * method runs inside a caller-supplied tenant transaction (`TenantTx`); none open their own.
 *
 * Domain ↔ persistence mapping is trivial: the domain `MemberRole`/`MembershipStatus` string unions
 * are identical to the Prisma enums, so values pass through directly.
 */
import { Injectable } from '@nestjs/common';
import type { Membership } from '@prisma/client';
import type { TenantTx } from '../../tenancy/tenancy.service';
import { prismaVersionedUpdate } from '../../../common/persistence/versioned-repository';
import type { MembershipDelta, MembershipState } from '../domain/entities/membership';

export function toMembershipState(row: Membership): MembershipState {
  return {
    id: row.id,
    role: row.role,
    status: row.status,
    pendingOwnerNominee: row.pendingOwnerNominee,
    invitationExpiresAt: row.invitationExpiresAt,
    version: row.version,
  };
}

export interface CreateMembershipData {
  sharedProfileId: string;
  userId: string;
  role: MembershipState['role'];
  status: MembershipState['status'];
  invitedAt: Date;
  invitationExpiresAt: Date;
  joinedAt?: Date | null;
}

@Injectable()
export class MembershipRepository {
  create(tx: TenantTx, tenantId: string, data: CreateMembershipData): Promise<Membership> {
    return tx.membership.create({
      data: {
        tenantId,
        sharedProfileId: data.sharedProfileId,
        userId: data.userId,
        role: data.role,
        status: data.status,
        invitedAt: data.invitedAt,
        invitationExpiresAt: data.invitationExpiresAt,
        joinedAt: data.joinedAt ?? null,
      },
    });
  }

  findById(tx: TenantTx, id: string): Promise<Membership | null> {
    return tx.membership.findUnique({ where: { id } });
  }

  findByProfileAndUser(tx: TenantTx, sharedProfileId: string, userId: string): Promise<Membership | null> {
    return tx.membership.findUnique({ where: { sharedProfileId_userId: { sharedProfileId, userId } } });
  }

  listByProfile(tx: TenantTx, sharedProfileId: string): Promise<Membership[]> {
    return tx.membership.findMany({ where: { sharedProfileId } });
  }

  /** Plain (non-versioned) field update for status-machine transitions (accept/decline/expire/leave/nominate). */
  async applyDelta(tx: TenantTx, id: string, delta: MembershipDelta): Promise<void> {
    await tx.membership.update({ where: { id }, data: { ...delta } });
  }

  /**
   * Version-guarded role change (FR-006a). Returns affected-row count: 0 ⇒ stale `expectedVersion`,
   * to be surfaced as a CONFLICT by the caller (via updateWithOptimisticLock).
   */
  changeRoleVersioned(
    tx: TenantTx,
    id: string,
    role: MembershipState['role'],
  ): (expectedVersion: number) => Promise<number> {
    return prismaVersionedUpdate(tx.membership, { id }, { role });
  }
}
