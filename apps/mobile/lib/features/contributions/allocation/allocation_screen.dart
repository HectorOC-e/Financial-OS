/// Allocation UI (T055): declare per-profile income, set a contribution percentage, and view the
/// remaining cross-profile headroom. Rendering + interaction only; the server enforces the 100% cap
/// and recomputes expected amounts (Principle VII / FR-015a).
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../profiles/profile_repository.dart' show ProfileException;
import '../contribution_repository.dart';

class AllocationScreen extends ConsumerWidget {
  const AllocationScreen({super.key, required this.sharedProfileId, required this.myMembershipId});

  final String sharedProfileId;
  final String myMembershipId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final remaining = ref.watch(remainingAllocationProvider);
    final incomeCtrl = TextEditingController();
    final pctCtrl = TextEditingController();

    return Scaffold(
      appBar: AppBar(title: const Text('My contribution')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            remaining.when(
              loading: () => const LinearProgressIndicator(),
              error: (e, _) => Text('$e'),
              data: (bp) => Card(
                child: ListTile(
                  title: const Text('Remaining across all profiles'),
                  trailing: Text('${(bp / 100).toStringAsFixed(2)}%'),
                ),
              ),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: incomeCtrl,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: 'Declared income (cents)'),
            ),
            const SizedBox(height: 8),
            FilledButton(
              onPressed: () => _run(context, ref, () => ref.read(contributionRepositoryProvider).setDeclaredIncome(
                    sharedProfileId: sharedProfileId,
                    membershipId: myMembershipId,
                    amountCents: incomeCtrl.text.trim(),
                  )),
              child: const Text('Save income'),
            ),
            const Divider(height: 32),
            TextField(
              controller: pctCtrl,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: 'Allocation % (e.g. 25)'),
            ),
            const SizedBox(height: 8),
            FilledButton(
              onPressed: () {
                final pct = double.tryParse(pctCtrl.text.trim()) ?? 0;
                final bp = (pct * 100).round(); // % → basis points
                _run(context, ref, () => ref.read(contributionRepositoryProvider).setAllocation(
                      sharedProfileId: sharedProfileId,
                      membershipId: myMembershipId,
                      percentageBp: bp,
                    ));
              },
              child: const Text('Set allocation'),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _run(BuildContext context, WidgetRef ref, Future<void> Function() action) async {
    final messenger = ScaffoldMessenger.of(context);
    try {
      await action();
      ref.invalidate(remainingAllocationProvider);
      messenger.showSnackBar(const SnackBar(content: Text('Saved')));
    } on ProfileException catch (e) {
      final msg = e.code == 'CAP_EXCEEDED'
          ? 'That would exceed 100% across your profiles — lower the percentage.'
          : e.message;
      messenger.showSnackBar(SnackBar(content: Text(msg)));
    }
  }
}
