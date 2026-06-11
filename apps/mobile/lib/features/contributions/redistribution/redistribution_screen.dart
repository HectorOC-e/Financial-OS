/// Redistribution UI (T075): edit each member's percentage and submit. The change is server-side
/// forward-only — it applies to the next period and never alters history (SC-006). Rendering only.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../profiles/profile_repository.dart' show ProfileException;
import '../contribution_repository.dart';

class RedistributionScreen extends ConsumerStatefulWidget {
  const RedistributionScreen({super.key, required this.sharedProfileId});

  final String sharedProfileId;

  @override
  ConsumerState<RedistributionScreen> createState() => _RedistributionScreenState();
}

class _RedistributionScreenState extends ConsumerState<RedistributionScreen> {
  final Map<String, TextEditingController> _controllers = {};

  @override
  void dispose() {
    for (final c in _controllers.values) {
      c.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final dashboard = ref.watch(contributionDashboardProvider(widget.sharedProfileId));
    return Scaffold(
      appBar: AppBar(title: const Text('Redistribute percentages')),
      body: dashboard.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('$e')),
        data: (p) {
          if (p == null) return const Center(child: Text('No access'));
          final members = List<Map<String, dynamic>>.from(p['members'] as List<dynamic>)
              .where((m) => m['status'] == 'ACTIVE')
              .toList();
          for (final m in members) {
            final id = m['id'] as String;
            final bp = (m['allocationPercentageBp'] as int?) ?? 0;
            _controllers.putIfAbsent(id, () => TextEditingController(text: (bp / 100).toStringAsFixed(0)));
          }
          return Column(
            children: [
              const Padding(
                padding: EdgeInsets.all(12),
                child: Text('Changes apply from the next period; history is preserved.'),
              ),
              Expanded(
                child: ListView(
                  children: [
                    for (final m in members)
                      ListTile(
                        title: Text((m['user'] as Map<String, dynamic>)['displayName'] as String? ?? 'Member'),
                        trailing: SizedBox(
                          width: 80,
                          child: TextField(
                            controller: _controllers[m['id'] as String],
                            keyboardType: TextInputType.number,
                            textAlign: TextAlign.end,
                            decoration: const InputDecoration(suffixText: '%'),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.all(12),
                child: FilledButton(
                  onPressed: () => _submit(members),
                  child: const Text('Apply (next period)'),
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  Future<void> _submit(List<Map<String, dynamic>> members) async {
    final messenger = ScaffoldMessenger.of(context);
    final allocations = <({String membershipId, int percentageBp})>[];
    for (final m in members) {
      final id = m['id'] as String;
      final pct = double.tryParse(_controllers[id]!.text.trim()) ?? 0;
      allocations.add((membershipId: id, percentageBp: (pct * 100).round()));
    }
    try {
      await ref.read(contributionRepositoryProvider).redistribute(
            sharedProfileId: widget.sharedProfileId,
            allocations: allocations,
          );
      ref.invalidate(contributionDashboardProvider(widget.sharedProfileId));
      messenger.showSnackBar(const SnackBar(content: Text('Applied — effective next period')));
    } on ProfileException catch (e) {
      final msg = e.code == 'CAP_EXCEEDED'
          ? 'A member would exceed 100% across their profiles.'
          : e.code == 'FORBIDDEN'
              ? 'You do not have permission to redistribute.'
              : e.message;
      messenger.showSnackBar(SnackBar(content: Text(msg)));
    }
  }
}
