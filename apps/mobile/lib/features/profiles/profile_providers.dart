/// Riverpod wiring for the profiles feature (T045). State holders only — no business logic
/// (Principle VII). The GraphQL client is provided at app bootstrap (overrideWithValue).
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:graphql_flutter/graphql_flutter.dart';

import 'profile_repository.dart';

/// Overridden in ProviderScope with the configured GraphQLClient at startup.
final graphqlClientProvider = Provider<GraphQLClient>(
  (ref) => throw UnimplementedError('graphqlClientProvider must be overridden at app bootstrap'),
);

final profileRepositoryProvider = Provider<ProfileRepository>(
  (ref) => ProfileRepository(ref.watch(graphqlClientProvider)),
);

/// The caller's own memberships (invitations to act on + profiles they belong to).
final myMembershipsProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>(
  (ref) => ref.watch(profileRepositoryProvider).myMemberships(),
);

/// A single shared profile with its (permission-scoped) members.
final sharedProfileProvider = FutureProvider.autoDispose.family<Map<String, dynamic>?, String>(
  (ref, id) => ref.watch(profileRepositoryProvider).sharedProfile(id),
);
