/// GraphQL documents for the US1 profile-governance surface (T045). Presentation only — every rule
/// (capabilities, optimistic concurrency, archival) is enforced server-side (Principle VII). Money
/// fields arrive as `BigInt`-scalar strings; never do money math on the client.
library;

const String myMembershipsQuery = r'''
  query MyMemberships {
    myMemberships {
      id
      role
      status
      invitationExpiresAt
      version
      user { id displayName }
    }
  }
''';

const String sharedProfileQuery = r'''
  query SharedProfile($id: UUID!) {
    sharedProfile(id: $id) {
      id
      name
      baseCurrency
      periodLength
      status
      owner { id user { id displayName } }
      members {
        id
        role
        status
        version
        invitationExpiresAt
        declaredIncome { amountCents currency }
        user { id displayName }
      }
    }
  }
''';

const String createSharedProfileMutation = r'''
  mutation CreateSharedProfile($input: CreateSharedProfileInput!) {
    createSharedProfile(input: $input) { id name status }
  }
''';

const String inviteMemberMutation = r'''
  mutation InviteMember($input: InviteMemberInput!) {
    inviteMember(input: $input) { id role status invitationExpiresAt }
  }
''';

const String acceptInvitationMutation = r'''
  mutation AcceptInvitation($membershipId: UUID!) {
    acceptInvitation(membershipId: $membershipId) { id status }
  }
''';

const String declineInvitationMutation = r'''
  mutation DeclineInvitation($membershipId: UUID!) {
    declineInvitation(membershipId: $membershipId) { id status }
  }
''';

const String changeMemberRoleMutation = r'''
  mutation ChangeMemberRole($membershipId: UUID!, $role: MemberRole!, $expectedVersion: Int!) {
    changeMemberRole(membershipId: $membershipId, role: $role, expectedVersion: $expectedVersion) {
      id role version
    }
  }
''';

const String leaveProfileMutation = r'''
  mutation LeaveProfile($membershipId: UUID!) {
    leaveProfile(membershipId: $membershipId) { id status }
  }
''';

const String nominateOwnerMutation = r'''
  mutation NominateOwner($input: NominateOwnerInput!) {
    nominateOwner(input: $input) { id }
  }
''';

const String acceptOwnershipMutation = r'''
  mutation AcceptOwnership($sharedProfileId: UUID!) {
    acceptOwnership(sharedProfileId: $sharedProfileId) { id owner { id } }
  }
''';

const String archiveProfileMutation = r'''
  mutation ArchiveProfile($sharedProfileId: UUID!) {
    archiveProfile(sharedProfileId: $sharedProfileId) { id status }
  }
''';
