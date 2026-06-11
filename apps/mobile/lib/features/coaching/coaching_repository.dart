/// GraphQL gateway for US7 AI coaching (T106). Read-only — coaching never mutates state; applying a
/// suggestion routes through a normal validated mutation elsewhere in the app (Principle III).
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:graphql_flutter/graphql_flutter.dart';

import '../profiles/profile_providers.dart';
import '../profiles/profile_repository.dart' show ProfileException;

const String coachingInsightsQuery = r'''
  query CoachingInsights($id: UUID!) {
    coachingInsights(sharedProfileId: $id) {
      summary
      suggestions { title detail suggestedMutation }
    }
  }
''';

class CoachingRepository {
  CoachingRepository(this._client);

  final GraphQLClient _client;

  Future<Map<String, dynamic>> insights(String sharedProfileId) async {
    final result = await _client.query(
      QueryOptions(document: gql(coachingInsightsQuery), variables: {'id': sharedProfileId}, fetchPolicy: FetchPolicy.networkOnly),
    );
    if (result.hasException) {
      final e = result.exception?.graphqlErrors.firstOrNull;
      if (e != null) throw ProfileException((e.extensions?['code'] as String?) ?? 'UNKNOWN', e.message);
      throw ProfileException('NETWORK', result.exception.toString());
    }
    return (result.data?['coachingInsights'] as Map<String, dynamic>?) ?? const {'summary': '', 'suggestions': <dynamic>[]};
  }
}

final coachingRepositoryProvider = Provider<CoachingRepository>(
  (ref) => CoachingRepository(ref.watch(graphqlClientProvider)),
);

final coachingInsightsProvider = FutureProvider.autoDispose.family<Map<String, dynamic>, String>(
  (ref, id) => ref.watch(coachingRepositoryProvider).insights(id),
);
