import 'package:graphql_flutter/graphql_flutter.dart';

/// GraphQL client factory (T031). Presentation-only: holds NO business logic (Principle VII).
///
/// Money is carried as the `BigInt` scalar serialized as a string over the wire (analysis I1 /
/// FR-024); generated operations map it to Dart `String` (see build.yaml). Convert to `BigInt`
/// only at the display edge — never perform money math on the client.
class GraphQLClientFactory {
  GraphQLClientFactory({required this.endpoint});

  /// Backend GraphQL endpoint (e.g. http://10.0.2.2:3000/graphql for the Android emulator).
  final String endpoint;

  GraphQLClient create({String? Function()? tokenProvider}) {
    final httpLink = HttpLink(endpoint);

    Link link = httpLink;
    if (tokenProvider != null) {
      final authLink = AuthLink(getToken: () async {
        final token = tokenProvider();
        return token == null ? null : 'Bearer $token';
      });
      link = authLink.concat(httpLink);
    }

    return GraphQLClient(
      link: link,
      cache: GraphQLCache(store: InMemoryStore()),
    );
  }
}
