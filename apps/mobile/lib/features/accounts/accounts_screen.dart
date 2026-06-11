/// Personal-accounts UI (T098): list the caller's own accounts and open new ones. Accounts are
/// private to the owner and isolated from shared profiles (server-enforced). Rendering only.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../profiles/profile_repository.dart' show ProfileException;
import 'account_repository.dart';

const _types = ['WALLET', 'ACCOUNT', 'INVESTMENT', 'EMERGENCY_FUND', 'CREDIT_CARD', 'DEBT'];

String _money(Map<String, dynamic>? m) {
  if (m == null) return '—';
  final cents = BigInt.tryParse(m['amountCents']?.toString() ?? '0') ?? BigInt.zero;
  return '${m['currency'] ?? ''} ${(cents / BigInt.from(100)).toStringAsFixed(2)}';
}

class AccountsScreen extends ConsumerWidget {
  const AccountsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final accounts = ref.watch(myAccountsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('My accounts')),
      floatingActionButton: FloatingActionButton.extended(
        icon: const Icon(Icons.add),
        label: const Text('New account'),
        onPressed: () => _createDialog(context, ref),
      ),
      body: accounts.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('$e')),
        data: (rows) => RefreshIndicator(
          onRefresh: () async => ref.invalidate(myAccountsProvider),
          child: ListView(
            children: [
              for (final acc in rows)
                ListTile(
                  leading: const Icon(Icons.account_balance_wallet_outlined),
                  title: Text(acc['name'] as String),
                  subtitle: Text(acc['type'] as String),
                  trailing: Text(_money(acc['balance'] as Map<String, dynamic>?)),
                ),
              if (rows.isEmpty) const ListTile(title: Text('No personal accounts yet')),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _createDialog(BuildContext context, WidgetRef ref) async {
    final nameCtrl = TextEditingController();
    final balanceCtrl = TextEditingController(text: '0');
    final currencyCtrl = TextEditingController(text: 'USD');
    String type = _types.first;
    final messenger = ScaffoldMessenger.of(context);

    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('New personal account'),
        content: StatefulBuilder(
          builder: (ctx, setState) => Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              DropdownButton<String>(
                value: type,
                isExpanded: true,
                items: [for (final t in _types) DropdownMenuItem(value: t, child: Text(t))],
                onChanged: (v) => setState(() => type = v ?? type),
              ),
              TextField(controller: nameCtrl, decoration: const InputDecoration(labelText: 'Name')),
              TextField(controller: currencyCtrl, decoration: const InputDecoration(labelText: 'Currency')),
              TextField(controller: balanceCtrl, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Opening balance (cents)')),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Create')),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await ref.read(accountRepositoryProvider).createAccount(
            type: type,
            name: nameCtrl.text.trim(),
            currency: currencyCtrl.text.trim().toUpperCase(),
            openingBalanceCents: balanceCtrl.text.trim(),
          );
      ref.invalidate(myAccountsProvider);
      messenger.showSnackBar(const SnackBar(content: Text('Account created')));
    } on ProfileException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    }
  }
}
