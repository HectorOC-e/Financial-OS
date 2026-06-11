/// GraphQL gateway for shared elements (T090). No business logic — issues operations and surfaces
/// typed server errors (OVERPAYMENT, CONFLICT, ARCHIVED, FORBIDDEN) for the UI to handle.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:graphql_flutter/graphql_flutter.dart';

import '../profiles/profile_providers.dart';
import '../profiles/profile_repository.dart' show ProfileException;
import 'shared_element_operations.dart';

class SharedElementRepository {
  SharedElementRepository(this._client);

  final GraphQLClient _client;

  Future<Map<String, dynamic>?> elements(String sharedProfileId) async {
    final data = await _run(sharedElementsQuery, {'id': sharedProfileId}, query: true);
    return data['sharedProfile'] as Map<String, dynamic>?;
  }

  Future<void> createGoal({required String sharedProfileId, required String name, required String targetAmountCents}) =>
      _run(createSharedGoalMutation, {'sharedProfileId': sharedProfileId, 'name': name, 'targetAmountCents': targetAmountCents});

  /// Throws ProfileException(CONFLICT) when [expectedVersion] is stale (FR-006a).
  Future<void> fundGoal({required String sharedGoalId, required String amountCents, required int expectedVersion}) =>
      _run(fundGoalMutation, {
        'input': {'sharedGoalId': sharedGoalId, 'amountCents': amountCents, 'expectedVersion': expectedVersion},
      });

  Future<void> createDebt({required String sharedProfileId, required String kind, required String name, required String outstandingBalanceCents}) =>
      _run(createSharedDebtMutation, {'sharedProfileId': sharedProfileId, 'kind': kind, 'name': name, 'outstandingBalanceCents': outstandingBalanceCents});

  /// Throws ProfileException(OVERPAYMENT) when the amount exceeds the balance (FR-020b).
  Future<void> payDebt({required String sharedDebtId, required String amountCents, required int expectedVersion}) =>
      _run(paySharedDebtMutation, {
        'input': {'sharedDebtId': sharedDebtId, 'amountCents': amountCents, 'expectedVersion': expectedVersion},
      });

  Future<void> createBudget({required String sharedProfileId, required String category, required String limitCents}) =>
      _run(createSharedBudgetMutation, {'sharedProfileId': sharedProfileId, 'category': category, 'limitCents': limitCents});

  Future<void> recordBudgetSpend({required String budgetId, required String amountCents, required int expectedVersion}) =>
      _run(recordBudgetSpendMutation, {'budgetId': budgetId, 'amountCents': amountCents, 'expectedVersion': expectedVersion});

  Future<Map<String, dynamic>> _run(String doc, Map<String, dynamic> vars, {bool query = false}) async {
    final result = query
        ? await _client.query(QueryOptions(document: gql(doc), variables: vars, fetchPolicy: FetchPolicy.networkOnly))
        : await _client.mutate(MutationOptions(document: gql(doc), variables: vars));
    if (result.hasException) {
      final e = result.exception?.graphqlErrors.firstOrNull;
      if (e != null) throw ProfileException((e.extensions?['code'] as String?) ?? 'UNKNOWN', e.message);
      throw ProfileException('NETWORK', result.exception.toString());
    }
    return result.data ?? <String, dynamic>{};
  }
}

final sharedElementRepositoryProvider = Provider<SharedElementRepository>(
  (ref) => SharedElementRepository(ref.watch(graphqlClientProvider)),
);

final sharedElementsProvider = FutureProvider.autoDispose.family<Map<String, dynamic>?, String>(
  (ref, id) => ref.watch(sharedElementRepositoryProvider).elements(id),
);
