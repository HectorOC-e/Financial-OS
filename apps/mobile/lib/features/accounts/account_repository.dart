/// GraphQL gateway for personal accounts (T098). No business logic.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:graphql_flutter/graphql_flutter.dart';

import '../profiles/profile_providers.dart';
import '../profiles/profile_repository.dart' show ProfileException;
import 'account_operations.dart';

class AccountRepository {
  AccountRepository(this._client);

  final GraphQLClient _client;

  Future<List<Map<String, dynamic>>> myAccounts() async {
    final data = await _run(myAccountsQuery, const {}, query: true);
    final personal = (data['me'] as Map<String, dynamic>?)?['personalProfile'] as Map<String, dynamic>?;
    return List<Map<String, dynamic>>.from((personal?['accounts'] as List<dynamic>?) ?? const []);
  }

  Future<void> createAccount({required String type, required String name, required String currency, required String openingBalanceCents}) =>
      _run(createPersonalAccountMutation, {
        'input': {'type': type, 'name': name, 'currency': currency, 'openingBalanceCents': openingBalanceCents},
      });

  Future<void> contributeFromAccount({
    required String accountId,
    required String sharedProfileId,
    required String membershipId,
    required String amountCents,
  }) =>
      _run(contributeFromAccountMutation, {
        'input': {'accountId': accountId, 'sharedProfileId': sharedProfileId, 'membershipId': membershipId, 'amountCents': amountCents},
      });

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

final accountRepositoryProvider = Provider<AccountRepository>(
  (ref) => AccountRepository(ref.watch(graphqlClientProvider)),
);

final myAccountsProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>(
  (ref) => ref.watch(accountRepositoryProvider).myAccounts(),
);
