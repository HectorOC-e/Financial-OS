/// GraphQL gateway for contributions (T055/T067). No business logic — issues operations and surfaces
/// typed server errors (notably CAP_EXCEEDED with the remaining headroom in `details.remainingBp`).
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:graphql_flutter/graphql_flutter.dart';

import '../profiles/profile_providers.dart';
import '../profiles/profile_repository.dart' show ProfileException;
import 'contribution_operations.dart';

class ContributionRepository {
  ContributionRepository(this._client);

  final GraphQLClient _client;

  Future<int> remainingAllocationPercentageBp() async {
    final data = await _query(remainingAllocationQuery);
    return data['remainingAllocationPercentageBp'] as int;
  }

  Future<Map<String, dynamic>?> dashboard(String sharedProfileId) async {
    final data = await _query(contributionDashboardQuery, {'id': sharedProfileId});
    return data['sharedProfile'] as Map<String, dynamic>?;
  }

  Future<void> setDeclaredIncome({
    required String sharedProfileId,
    required String membershipId,
    required String amountCents, // BigInt scalar as string — no client-side money math
  }) =>
      _mutate(setDeclaredIncomeMutation, {
        'input': {'sharedProfileId': sharedProfileId, 'membershipId': membershipId, 'amountCents': amountCents},
      });

  /// Throws ProfileException(CAP_EXCEEDED) carrying `details.remainingBp` when over 100% (FR-015a).
  Future<void> setAllocation({
    required String sharedProfileId,
    required String membershipId,
    required int percentageBp,
  }) =>
      _mutate(setAllocationMutation, {
        'input': {'sharedProfileId': sharedProfileId, 'membershipId': membershipId, 'percentageBp': percentageBp},
      });

  Future<void> recordContribution({
    required String sharedProfileId,
    required String membershipId,
    required String amountCents,
    String? sourceAccountId,
  }) =>
      _mutate(recordContributionMutation, {
        'input': {
          'sharedProfileId': sharedProfileId,
          'membershipId': membershipId,
          'amountCents': amountCents,
          if (sourceAccountId != null) 'sourceAccountId': sourceAccountId,
        },
      });

  /// Redistribute percentages (US4). Effective next period only; server preserves history (SC-006).
  Future<Map<String, dynamic>> redistribute({
    required String sharedProfileId,
    required List<({String membershipId, int percentageBp})> allocations,
  }) async {
    final data = await _mutate(redistributeMutation, {
      'sharedProfileId': sharedProfileId,
      'allocations': [
        for (final a in allocations)
          {'sharedProfileId': sharedProfileId, 'membershipId': a.membershipId, 'percentageBp': a.percentageBp},
      ],
    });
    return data['redistribute'] as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> _query(String doc, [Map<String, dynamic> vars = const {}]) async {
    final r = await _client.query(QueryOptions(document: gql(doc), variables: vars, fetchPolicy: FetchPolicy.networkOnly));
    return _unwrap(r);
  }

  Future<Map<String, dynamic>> _mutate(String doc, [Map<String, dynamic> vars = const {}]) async {
    final r = await _client.mutate(MutationOptions(document: gql(doc), variables: vars));
    return _unwrap(r);
  }

  Map<String, dynamic> _unwrap(QueryResult r) {
    if (r.hasException) {
      final e = r.exception?.graphqlErrors.firstOrNull;
      if (e != null) {
        throw ProfileException((e.extensions?['code'] as String?) ?? 'UNKNOWN', e.message);
      }
      throw ProfileException('NETWORK', r.exception.toString());
    }
    return r.data ?? <String, dynamic>{};
  }
}

final contributionRepositoryProvider = Provider<ContributionRepository>(
  (ref) => ContributionRepository(ref.watch(graphqlClientProvider)),
);

final remainingAllocationProvider = FutureProvider.autoDispose<int>(
  (ref) => ref.watch(contributionRepositoryProvider).remainingAllocationPercentageBp(),
);

final contributionDashboardProvider = FutureProvider.autoDispose.family<Map<String, dynamic>?, String>(
  (ref, id) => ref.watch(contributionRepositoryProvider).dashboard(id),
);
