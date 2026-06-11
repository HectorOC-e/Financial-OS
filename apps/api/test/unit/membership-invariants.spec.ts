/**
 * Membership & profile invariant unit tests (T033 — constitution: written before implementation,
 * deterministic, no I/O). Covers FR-002a (status machine + 14-day expiry), FR-007a (owner must
 * transfer before leave), FR-007b (nominate-and-accept), FR-007c (sole-owner archive), FR-005
 * (single owner).
 */
import {
  accept,
  decline,
  expire,
  leave,
  changeRole,
  nominateOwner,
  acceptOwnership,
  invitationExpiresAt,
  isInvitationExpired,
  INVITATION_TTL_DAYS,
  MembershipState,
} from '../../src/modules/profiles/domain/entities/membership';
import {
  archive,
  assertSingleOwner,
  assertWritable,
  SharedProfileState,
} from '../../src/modules/profiles/domain/entities/shared-profile';
import { DomainErrorCode } from '../../src/common/errors';

const NOW = new Date('2026-06-01T00:00:00.000Z');

function member(overrides: Partial<MembershipState> = {}): MembershipState {
  return {
    id: 'm1',
    role: 'CONTRIBUTOR',
    status: 'ACTIVE',
    pendingOwnerNominee: false,
    invitationExpiresAt: invitationExpiresAt(NOW),
    version: 0,
    ...overrides,
  };
}

describe('invitation expiry (FR-002a)', () => {
  it('expires exactly 14 days after issuance', () => {
    const expires = invitationExpiresAt(NOW);
    const days = (expires.getTime() - NOW.getTime()) / (24 * 60 * 60 * 1000);
    expect(days).toBe(INVITATION_TTL_DAYS);
  });

  it('is not expired before the deadline, expired at/after it', () => {
    const m = member({ status: 'INVITED' });
    expect(isInvitationExpired(m, NOW)).toBe(false);
    expect(isInvitationExpired(m, new Date(m.invitationExpiresAt.getTime() - 1))).toBe(false);
    expect(isInvitationExpired(m, m.invitationExpiresAt)).toBe(true);
    expect(isInvitationExpired(m, new Date(m.invitationExpiresAt.getTime() + 1))).toBe(true);
  });
});

describe('status machine (FR-002a)', () => {
  it('accepts an in-window invitation: INVITED → ACTIVE', () => {
    const res = accept(member({ status: 'INVITED' }), NOW);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.status).toBe('ACTIVE');
      expect(res.value.joinedAt).toEqual(NOW);
    }
  });

  it('rejects accepting an expired invitation', () => {
    const m = member({ status: 'INVITED' });
    const res = accept(m, new Date(m.invitationExpiresAt.getTime() + 1));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe(DomainErrorCode.INVARIANT);
  });

  it('declines an invitation: INVITED → DECLINED', () => {
    const res = decline(member({ status: 'INVITED' }));
    expect(res.ok && res.value.status).toBe('DECLINED');
  });

  it('expires an unanswered invitation only once past deadline', () => {
    const m = member({ status: 'INVITED' });
    expect(expire(m, NOW).ok).toBe(false);
    const res = expire(m, m.invitationExpiresAt);
    expect(res.ok && res.value.status).toBe('EXPIRED');
  });

  it.each(['ACTIVE', 'DECLINED', 'EXPIRED', 'LEFT'] as const)(
    'cannot accept from terminal/non-invited status %s',
    (status) => {
      expect(accept(member({ status }), NOW).ok).toBe(false);
    },
  );
});

describe('leaving (FR-007a)', () => {
  it('an ACTIVE non-owner may leave', () => {
    const res = leave(member({ role: 'ADMIN' }), NOW);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.status).toBe('LEFT');
      expect(res.value.leftAt).toEqual(NOW);
    }
  });

  it('the OWNER must transfer ownership before leaving', () => {
    const res = leave(member({ role: 'OWNER' }), NOW);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe(DomainErrorCode.INVARIANT);
  });
});

describe('role changes (FR-006)', () => {
  it('changes an ACTIVE member role', () => {
    const res = changeRole(member({ role: 'VIEWER' }), 'CONTRIBUTOR');
    expect(res.ok && res.value.role).toBe('CONTRIBUTOR');
  });

  it('refuses to change the owner role directly', () => {
    expect(changeRole(member({ role: 'OWNER' }), 'ADMIN').ok).toBe(false);
  });

  it('refuses to assign OWNER directly (transfer-only)', () => {
    expect(changeRole(member({ role: 'ADMIN' }), 'OWNER').ok).toBe(false);
  });
});

describe('ownership transfer — nominate & accept (FR-007b)', () => {
  it('nominates an ACTIVE member', () => {
    const res = nominateOwner(member({ role: 'ADMIN' }));
    expect(res.ok && res.value.pendingOwnerNominee).toBe(true);
  });

  it('refuses to nominate a non-active member', () => {
    expect(nominateOwner(member({ status: 'INVITED' })).ok).toBe(false);
  });

  it('completes transfer: nominee→OWNER, outgoing owner→ADMIN, single owner preserved', () => {
    const nominee = member({ id: 'n', role: 'ADMIN', pendingOwnerNominee: true });
    const owner = member({ id: 'o', role: 'OWNER' });
    const res = acceptOwnership(nominee, owner);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.nominee.role).toBe('OWNER');
      expect(res.value.nominee.pendingOwnerNominee).toBe(false);
      expect(res.value.outgoingOwner.role).toBe('ADMIN');
    }
  });

  it('refuses acceptance without a pending nomination', () => {
    const res = acceptOwnership(member({ id: 'n', role: 'ADMIN' }), member({ id: 'o', role: 'OWNER' }));
    expect(res.ok).toBe(false);
  });
});

describe('profile archival & single-owner (FR-007c / FR-005)', () => {
  const profile: SharedProfileState = { id: 'p1', status: 'ACTIVE', ownerMembershipId: 'o' };

  it('a sole owner may archive', () => {
    const owner = member({ id: 'o', role: 'OWNER' });
    const res = archive(profile, owner, [owner], NOW);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.status).toBe('ARCHIVED');
      expect(res.value.archivedAt).toEqual(NOW);
    }
  });

  it('refuses archival when other ACTIVE members remain', () => {
    const owner = member({ id: 'o', role: 'OWNER' });
    const other = member({ id: 'x', role: 'CONTRIBUTOR' });
    expect(archive(profile, owner, [owner, other], NOW).ok).toBe(false);
  });

  it('refuses archival by a non-owner', () => {
    const admin = member({ id: 'a', role: 'ADMIN' });
    const res = archive(profile, admin, [admin], NOW);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe(DomainErrorCode.FORBIDDEN);
  });

  it('archived profiles are not writable (FR-007c)', () => {
    const res = assertWritable({ id: 'p1', status: 'ARCHIVED', ownerMembershipId: 'o' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe(DomainErrorCode.ARCHIVED);
  });

  it('asserts exactly one active owner', () => {
    const owner = member({ id: 'o', role: 'OWNER' });
    expect(assertSingleOwner([owner, member({ id: 'x', role: 'VIEWER' })]).ok).toBe(true);
    expect(assertSingleOwner([owner, member({ id: 'y', role: 'OWNER' })]).ok).toBe(false);
    expect(assertSingleOwner([member({ id: 'x', role: 'VIEWER' })]).ok).toBe(false);
  });
});
