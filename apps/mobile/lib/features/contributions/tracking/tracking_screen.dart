/// Contribution-tracking UI (T067): record a contribution and view live standings + pool. Standings,
/// variance, and the emergent pool are all server-computed (Principle VII); the dashboard refreshes on
/// the ≤5s freshness path (SC-007). Money is shown from BigInt-scalar strings — no client math.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../profiles/profile_repository.dart' show ProfileException;
import '../contribution_repository.dart';

String _money(Map<String, dynamic>? m) {
  if (m == null) return '—';
  final cents = m['amountCents']?.toString() ?? '0';
  final value = (BigInt.tryParse(cents) ?? BigInt.zero) / BigInt.from(100);
  return '${m['currency'] ?? ''} ${value.toStringAsFixed(2)}';
}

class TrackingScreen extends ConsumerWidget {
  const TrackingScreen({super.key, required this.sharedProfileId, required this.myMembershipId});

  final String sharedProfileId;
  final String myMembershipId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final dashboard = ref.watch(contributionDashboardProvider(sharedProfileId));
    return Scaffold(
      appBar: AppBar(title: const Text('Contributions')),
      floatingActionButton: FloatingActionButton.extended(
        icon: const Icon(Icons.add),
        label: const Text('Record'),
        onPressed: () => _recordDialog(context, ref),
      ),
      body: dashboard.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('$e')),
        data: (p) {
          if (p == null) return const Center(child: Text('No access'));
          final members = List<Map<String, dynamic>>.from(p['members'] as List<dynamic>);
          return RefreshIndicator(
            onRefresh: () async => ref.invalidate(contributionDashboardProvider(sharedProfileId)),
            child: ListView(
              children: [
                Card(
                  child: ListTile(
                    title: const Text('Pool total'),
                    trailing: Text(_money(p['poolTotal'] as Map<String, dynamic>?), style: Theme.of(context).textTheme.titleLarge),
                  ),
                ),
                for (final m in members) _StandingTile(member: m),
              ],
            ),
          );
        },
      ),
    );
  }

  Future<void> _recordDialog(BuildContext context, WidgetRef ref) async {
    final ctrl = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Record contribution'),
        content: TextField(
          controller: ctrl,
          keyboardType: TextInputType.number,
          decoration: const InputDecoration(labelText: 'Amount (cents)'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Record')),
        ],
      ),
    );
    if (ok != true) return;
    final messenger = ScaffoldMessenger.of(context);
    try {
      await ref.read(contributionRepositoryProvider).recordContribution(
            sharedProfileId: sharedProfileId,
            membershipId: myMembershipId,
            amountCents: ctrl.text.trim(),
          );
      ref.invalidate(contributionDashboardProvider(sharedProfileId));
      messenger.showSnackBar(const SnackBar(content: Text('Recorded')));
    } on ProfileException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    }
  }
}

class _StandingTile extends StatelessWidget {
  const _StandingTile({required this.member});

  final Map<String, dynamic> member;

  @override
  Widget build(BuildContext context) {
    final user = member['user'] as Map<String, dynamic>;
    final standing = member['standing'] as Map<String, dynamic>?;
    final state = standing?['state'] as String? ?? '—';
    final color = switch (state) {
      'AHEAD' => Colors.green,
      'BEHIND' => Colors.orange,
      'ON_TRACK' => Colors.blue,
      _ => Colors.grey,
    };
    return ListTile(
      title: Text(user['displayName'] as String? ?? user['id'] as String),
      subtitle: standing == null
          ? const Text('No active period')
          : Text('Expected ${_money(standing['expected'] as Map<String, dynamic>?)} · '
              'Actual ${_money(standing['actual'] as Map<String, dynamic>?)}'),
      trailing: Chip(label: Text(state), backgroundColor: color.withValues(alpha: 0.15)),
    );
  }
}
