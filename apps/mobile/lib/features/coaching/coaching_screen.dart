/// AI coaching UI (T106): shows read-only advisory insights for a profile. Suggestions are advisory;
/// a "suggestedMutation" hint is just a pointer to a normal action the user performs elsewhere — the
/// AI never changes state (Principle III). Rendering only.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'coaching_repository.dart';

class CoachingScreen extends ConsumerWidget {
  const CoachingScreen({super.key, required this.sharedProfileId});

  final String sharedProfileId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final insights = ref.watch(coachingInsightsProvider(sharedProfileId));
    return Scaffold(
      appBar: AppBar(title: const Text('Coaching')),
      body: insights.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('$e')),
        data: (data) {
          final suggestions = List<Map<String, dynamic>>.from((data['suggestions'] as List<dynamic>?) ?? const []);
          return RefreshIndicator(
            onRefresh: () async => ref.invalidate(coachingInsightsProvider(sharedProfileId)),
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Text(data['summary'] as String? ?? '', style: Theme.of(context).textTheme.titleMedium),
                  ),
                ),
                const SizedBox(height: 8),
                for (final s in suggestions)
                  Card(
                    child: ListTile(
                      leading: const Icon(Icons.lightbulb_outline),
                      title: Text(s['title'] as String? ?? ''),
                      subtitle: Text(s['detail'] as String? ?? ''),
                      trailing: s['suggestedMutation'] == null
                          ? null
                          : Chip(label: Text(s['suggestedMutation'] as String)),
                    ),
                  ),
                const Padding(
                  padding: EdgeInsets.all(12),
                  child: Text('Suggestions are advisory. Applying one uses a normal validated action.', textAlign: TextAlign.center),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}
