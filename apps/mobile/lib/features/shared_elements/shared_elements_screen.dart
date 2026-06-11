/// Shared-elements UI (T090): goals, debts/credit cards, investments, and period-scoped budgets,
/// with create / fund / pay / record-spend actions. Rendering + interaction only; the server enforces
/// money integrity, the 100% responsibility rule, overpayment rejection, and concurrency.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../profiles/profile_repository.dart' show ProfileException;
import 'shared_element_repository.dart';

String _money(Map<String, dynamic>? m) {
  if (m == null) return '—';
  final cents = BigInt.tryParse(m['amountCents']?.toString() ?? '0') ?? BigInt.zero;
  return '${m['currency'] ?? ''} ${(cents / BigInt.from(100)).toStringAsFixed(2)}';
}

class SharedElementsScreen extends ConsumerWidget {
  const SharedElementsScreen({super.key, required this.sharedProfileId});

  final String sharedProfileId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final elements = ref.watch(sharedElementsProvider(sharedProfileId));
    return DefaultTabController(
      length: 3,
      child: Scaffold(
      appBar: AppBar(
        title: const Text('Shared elements'),
        bottom: const TabBar(tabs: [Tab(text: 'Goals'), Tab(text: 'Debts'), Tab(text: 'Budgets')]),
      ),
      body: elements.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('$e')),
        data: (p) {
          if (p == null) return const Center(child: Text('No access'));
          final goals = List<Map<String, dynamic>>.from(p['sharedGoals'] as List<dynamic>);
          final debts = List<Map<String, dynamic>>.from(p['sharedDebts'] as List<dynamic>);
          final budgets = List<Map<String, dynamic>>.from(p['sharedBudgets'] as List<dynamic>);
          return TabBarView(
            children: [
              _GoalsTab(sharedProfileId: sharedProfileId, goals: goals),
              _DebtsTab(sharedProfileId: sharedProfileId, debts: debts),
              _BudgetsTab(sharedProfileId: sharedProfileId, budgets: budgets),
            ],
          );
        },
      ),
      ),
    );
  }
}

class _GoalsTab extends ConsumerWidget {
  const _GoalsTab({required this.sharedProfileId, required this.goals});
  final String sharedProfileId;
  final List<Map<String, dynamic>> goals;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return ListView(
      children: [
        for (final g in goals)
          ListTile(
            title: Text(g['name'] as String),
            subtitle: Text('${_money(g['fundedAmount'] as Map<String, dynamic>?)} / ${_money(g['targetAmount'] as Map<String, dynamic>?)}'),
            trailing: TextButton(
              child: const Text('Fund'),
              onPressed: () => _amountDialog(context, ref, 'Fund goal', (cents) async {
                await ref.read(sharedElementRepositoryProvider).fundGoal(
                      sharedGoalId: g['id'] as String,
                      amountCents: cents,
                      expectedVersion: g['version'] as int,
                    );
                ref.invalidate(sharedElementsProvider(sharedProfileId));
              }),
            ),
          ),
      ],
    );
  }
}

class _DebtsTab extends ConsumerWidget {
  const _DebtsTab({required this.sharedProfileId, required this.debts});
  final String sharedProfileId;
  final List<Map<String, dynamic>> debts;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return ListView(
      children: [
        for (final d in debts)
          ListTile(
            title: Text('${d['name']} (${d['kind']})'),
            subtitle: Text('Outstanding ${_money(d['outstandingBalance'] as Map<String, dynamic>?)}'),
            trailing: TextButton(
              child: const Text('Pay'),
              onPressed: () => _amountDialog(context, ref, 'Pay debt', (cents) async {
                await ref.read(sharedElementRepositoryProvider).payDebt(
                      sharedDebtId: d['id'] as String,
                      amountCents: cents,
                      expectedVersion: d['version'] as int,
                    );
                ref.invalidate(sharedElementsProvider(sharedProfileId));
              }),
            ),
          ),
      ],
    );
  }
}

class _BudgetsTab extends ConsumerWidget {
  const _BudgetsTab({required this.sharedProfileId, required this.budgets});
  final String sharedProfileId;
  final List<Map<String, dynamic>> budgets;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return ListView(
      children: [
        for (final b in budgets)
          ListTile(
            title: Text(b['category'] as String),
            subtitle: Text('Remaining ${_money(b['remaining'] as Map<String, dynamic>?)} of ${_money(b['limit'] as Map<String, dynamic>?)}'),
            trailing: TextButton(
              child: const Text('Spend'),
              onPressed: () => _amountDialog(context, ref, 'Record spend', (cents) async {
                await ref.read(sharedElementRepositoryProvider).recordBudgetSpend(
                      budgetId: b['id'] as String,
                      amountCents: cents,
                      expectedVersion: b['version'] as int,
                    );
                ref.invalidate(sharedElementsProvider(sharedProfileId));
              }),
            ),
          ),
      ],
    );
  }
}

/// Prompt for a cents amount and run [action], mapping server domain errors to feedback.
Future<void> _amountDialog(BuildContext context, WidgetRef ref, String title, Future<void> Function(String cents) action) async {
  final ctrl = TextEditingController();
  final messenger = ScaffoldMessenger.of(context);
  final ok = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(title),
      content: TextField(controller: ctrl, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Amount (cents)')),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
        FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('OK')),
      ],
    ),
  );
  if (ok != true) return;
  try {
    await action(ctrl.text.trim());
    messenger.showSnackBar(const SnackBar(content: Text('Done')));
  } on ProfileException catch (e) {
    final msg = switch (e.code) {
      'OVERPAYMENT' => 'Payment exceeds the outstanding balance.',
      'CONFLICT' => 'Someone else just changed this — refresh and retry.',
      'ARCHIVED' => 'This profile is archived (read-only).',
      'FORBIDDEN' => 'You do not have permission for that.',
      _ => e.message,
    };
    messenger.showSnackBar(SnackBar(content: Text(msg)));
  }
}
