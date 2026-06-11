/// Thin GraphQL gateway for profile governance (T045). Holds no business logic — it issues the
/// server operations and surfaces typed errors (notably CONFLICT for optimistic concurrency and
/// FORBIDDEN/ARCHIVED) so the UI can react. All decisions remain server-side (Principle VII).
library;

import 'package:graphql_flutter/graphql_flutter.dart';

import 'profile_operations.dart';

/// A server-originated domain error, identified by its stable `extensions.code`.
class ProfileException implements Exception {
  ProfileException(this.code, this.message);

  final String code; // e.g. CONFLICT, FORBIDDEN, ARCHIVED, VALIDATION
  final String message;

  bool get isConflict => code == 'CONFLICT';
  bool get isForbidden => code == 'FORBIDDEN';
  bool get isArchived => code == 'ARCHIVED';

  @override
  String toString() => 'ProfileException($code): $message';
}

class ProfileRepository {
  ProfileRepository(this._client);

  final GraphQLClient _client;

  Future<List<Map<String, dynamic>>> myMemberships() async {
    final data = await _query(myMembershipsQuery);
    return List<Map<String, dynamic>>.from(data['myMemberships'] as List<dynamic>);
  }

  Future<Map<String, dynamic>?> sharedProfile(String id) async {
    final data = await _query(sharedProfileQuery, {'id': id});
    return data['sharedProfile'] as Map<String, dynamic>?;
  }

  Future<Map<String, dynamic>> createSharedProfile({
    required String name,
    required String baseCurrency,
    String periodLength = 'MONTHLY',
  }) async {
    final data = await _mutate(createSharedProfileMutation, {
      'input': {'name': name, 'baseCurrency': baseCurrency, 'periodLength': periodLength},
    });
    return data['createSharedProfile'] as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> inviteMember({
    required String sharedProfileId,
    required String userId,
    required String role,
  }) async {
    final data = await _mutate(inviteMemberMutation, {
      'input': {'sharedProfileId': sharedProfileId, 'userId': userId, 'role': role},
    });
    return data['inviteMember'] as Map<String, dynamic>;
  }

  Future<void> acceptInvitation(String membershipId) =>
      _mutate(acceptInvitationMutation, {'membershipId': membershipId});

  Future<void> declineInvitation(String membershipId) =>
      _mutate(declineInvitationMutation, {'membershipId': membershipId});

  /// Pass the [expectedVersion] last read; a CONFLICT means another edit landed first — refetch.
  Future<Map<String, dynamic>> changeMemberRole({
    required String membershipId,
    required String role,
    required int expectedVersion,
  }) async {
    final data = await _mutate(changeMemberRoleMutation, {
      'membershipId': membershipId,
      'role': role,
      'expectedVersion': expectedVersion,
    });
    return data['changeMemberRole'] as Map<String, dynamic>;
  }

  Future<void> leaveProfile(String membershipId) =>
      _mutate(leaveProfileMutation, {'membershipId': membershipId});

  Future<void> nominateOwner({required String sharedProfileId, required String nomineeMembershipId}) =>
      _mutate(nominateOwnerMutation, {
        'input': {'sharedProfileId': sharedProfileId, 'nomineeMembershipId': nomineeMembershipId},
      });

  Future<void> acceptOwnership(String sharedProfileId) =>
      _mutate(acceptOwnershipMutation, {'sharedProfileId': sharedProfileId});

  Future<void> archiveProfile(String sharedProfileId) =>
      _mutate(archiveProfileMutation, {'sharedProfileId': sharedProfileId});

  // --- helpers ----------------------------------------------------------------------------------

  Future<Map<String, dynamic>> _query(String doc, [Map<String, dynamic> vars = const {}]) async {
    final result = await _client.query(QueryOptions(
      document: gql(doc),
      variables: vars,
      fetchPolicy: FetchPolicy.networkOnly,
    ));
    return _unwrap(result);
  }

  Future<Map<String, dynamic>> _mutate(String doc, [Map<String, dynamic> vars = const {}]) async {
    final result = await _client.mutate(MutationOptions(document: gql(doc), variables: vars));
    return _unwrap(result);
  }

  Map<String, dynamic> _unwrap(QueryResult result) {
    if (result.hasException) {
      final gqlError = result.exception?.graphqlErrors.firstOrNull;
      if (gqlError != null) {
        final code = (gqlError.extensions?['code'] as String?) ?? 'UNKNOWN';
        throw ProfileException(code, gqlError.message);
      }
      throw ProfileException('NETWORK', result.exception.toString());
    }
    return (result.data ?? const {}) as Map<String, dynamic>;
  }
}
