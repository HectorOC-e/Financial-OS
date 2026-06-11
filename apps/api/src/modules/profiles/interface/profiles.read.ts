/**
 * Read model for the US1 query surface (T038/T039). Assembles permission-scoped DTO trees inside a
 * tenant transaction. Enforces personal-account isolation (FR-004): only the caller's own personal
 * profile is ever attached to a user DTO; `sharedProfile` returns null unless the caller is an
 * ACTIVE member (existence is not leaked to non-members).
 */
import { Injectable } from '@nestjs/common';
import type { User } from '@prisma/client';
import { TenancyService, TenantTx } from '../../tenancy/tenancy.service';
import type { TenantPrincipal } from '../../tenancy/tenant-context';
import { ProfileRepository } from '../infrastructure/profile.repository';
import { MembershipRepository } from '../infrastructure/membership.repository';
import { MembershipType, PersonalProfileType, SharedProfileType, UserType } from './dto/profile.types';
import { mapMembership, mapSharedProfile, mapUserSelf } from './dto/profile.mapper';

@Injectable()
export class ProfilesReadService {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly profiles: ProfileRepository,
    private readonly memberships: MembershipRepository,
  ) {}

  async me(principal: TenantPrincipal): Promise<UserType> {
    return this.tenancy.withTenant(principal.tenantId, async (tx) => {
      const user = await tx.user.findUnique({ where: { id: principal.userId } });
      if (!user) throw new Error('Authenticated user not found in tenant');
      const personal = await this.profiles.findOrCreatePersonalProfile(tx, principal.tenantId, principal.userId);
      const profileDto = new PersonalProfileType();
      profileDto.id = personal.id;
      profileDto.userId = personal.userId;
      profileDto.accounts = []; // resolved per-owner by the accounts module field resolver (US6)
      return mapUserSelf(user, profileDto);
    });
  }

  async sharedProfile(principal: TenantPrincipal, id: string): Promise<SharedProfileType | null> {
    return this.tenancy.withTenant(principal.tenantId, async (tx) => {
      const profile = await this.profiles.findSharedProfile(tx, id);
      if (!profile) return null;
      const members = await this.memberships.listByProfile(tx, id);
      // Permission scope: only an ACTIVE member may view the profile (do not leak existence).
      const caller = members.find((m) => m.userId === principal.userId && m.status === 'ACTIVE');
      if (!caller) return null;
      const usersById = await this.loadUsers(tx, members.map((m) => m.userId));
      return mapSharedProfile(profile, members, usersById);
    });
  }

  /** Assemble a single membership DTO (used to shape mutation results). */
  async membershipById(principal: TenantPrincipal, id: string): Promise<MembershipType> {
    return this.tenancy.withTenant(principal.tenantId, async (tx) => {
      const row = await this.memberships.findById(tx, id);
      if (!row) throw new Error('Membership not found after mutation');
      const user = await tx.user.findUnique({ where: { id: row.userId } });
      const profile = await this.profiles.findSharedProfile(tx, row.sharedProfileId);
      return mapMembership(row, user!, profile?.baseCurrency ?? 'USD');
    });
  }

  async myMemberships(principal: TenantPrincipal): Promise<MembershipType[]> {
    return this.tenancy.withTenant(principal.tenantId, async (tx) => {
      const rows = await tx.membership.findMany({
        where: { userId: principal.userId, status: { in: ['INVITED', 'ACTIVE'] } },
      });
      const self = await tx.user.findUnique({ where: { id: principal.userId } });
      if (!self) return [];
      const profileIds = [...new Set(rows.map((r) => r.sharedProfileId))];
      const profiles = await tx.sharedProfile.findMany({ where: { id: { in: profileIds } } });
      const currencyByProfile = new Map(profiles.map((p) => [p.id, p.baseCurrency]));
      return rows.map((r) => mapMembership(r, self, currencyByProfile.get(r.sharedProfileId) ?? 'USD'));
    });
  }

  private async loadUsers(tx: TenantTx, userIds: string[]): Promise<Map<string, User>> {
    const ids = [...new Set(userIds)];
    const users = await tx.user.findMany({ where: { id: { in: ids } } });
    return new Map(users.map((u) => [u.id, u]));
  }
}
