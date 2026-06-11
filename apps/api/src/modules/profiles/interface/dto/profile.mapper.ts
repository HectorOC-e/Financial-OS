/**
 * Row → DTO mappers (T038/T039). Pure functions translating persistence rows into the GraphQL DTO
 * tree. `personalProfile` is intentionally never attached to a member's user here — only the
 * dedicated self path attaches it (FR-004 isolation).
 */
import type { Membership, SharedProfile, User } from '@prisma/client';
import { MoneyType } from '../../../../common/graphql/money.type';
import { MembershipType, PersonalProfileType, SharedProfileType, UserType } from './profile.types';

export function mapUserPublic(user: User): UserType {
  const dto = new UserType();
  dto.id = user.id;
  dto.displayName = user.displayName;
  dto.personalProfile = null; // never expose another user's personal profile (FR-004)
  return dto;
}

export function mapUserSelf(user: User, personalProfile: PersonalProfileType): UserType {
  const dto = mapUserPublic(user);
  dto.personalProfile = personalProfile;
  return dto;
}

export function mapMembership(row: Membership, user: User, currency: string): MembershipType {
  const dto = new MembershipType();
  dto.id = row.id;
  dto.user = mapUserPublic(user);
  dto.role = row.role;
  dto.status = row.status;
  dto.invitationExpiresAt = row.status === 'INVITED' ? row.invitationExpiresAt : null;
  dto.declaredIncome = MoneyType.fromCents(row.declaredIncomeCents, currency);
  dto.version = row.version;
  return dto;
}

export function mapSharedProfile(
  profile: SharedProfile,
  members: Membership[],
  usersById: Map<string, User>,
): SharedProfileType {
  const dto = new SharedProfileType();
  dto.id = profile.id;
  dto.name = profile.name;
  dto.baseCurrency = profile.baseCurrency;
  dto.periodLength = profile.periodLength;
  dto.status = profile.status;

  const mapped = members.map((m) => mapMembership(m, usersById.get(m.userId)!, profile.baseCurrency));
  dto.members = mapped;
  dto.owner = mapped.find((m) => m.role === 'OWNER' && m.status === 'ACTIVE') ?? null;
  return dto;
}
