/// Profile-management UI (T045): list memberships, act on invitations, and manage a profile's
/// members (invite, change role, transfer ownership, archive). Rendering + interaction only — the
/// server validates every action (Principle VII). Optimistic-concurrency CONFLICTs are surfaced as a
/// prompt to refresh; FORBIDDEN/ARCHIVED are shown as inline messages.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'profile_providers.dart';
import 'profile_repository.dart';

const _roles = ['ADMIN', 'CONTRIBUTOR', 'VIEWER'];

class MyMembershipsScreen extends ConsumerWidget {
  const MyMembershipsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final memberships = ref.watch(myMembershipsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('My Profiles')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _createProfileDialog(context, ref),
        icon: const Icon(Icons.add),
        label: const Text('New profile'),
      ),
      body: memberships.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('$e')),
        data: (rows) => RefreshIndicator(
          onRefresh: () async => ref.invalidate(myMembershipsProvider),
          child: ListView(
            children: [
              for (final m in rows) _MembershipTile(membership: m),
              if (rows.isEmpty) const ListTile(title: Text('No profiles yet')),
            ],
          ),
        ),
      ),
    );
  }
}

class _MembershipTile extends ConsumerWidget {
  const _MembershipTile({required this.membership});

  final Map<String, dynamic> membership;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final status = membership['status'] as String;
    final role = membership['role'] as String;
    final id = membership['id'] as String;
    final repo = ref.read(profileRepositoryProvider);

    return ListTile(
      title: Text('Role: $role'),
      subtitle: Text('Status: $status'),
      trailing: status == 'INVITED'
          ? Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextButton(
                  onPressed: () => _run(context, ref, () => repo.acceptInvitation(id)),
                  child: const Text('Accept'),
                ),
                TextButton(
                  onPressed: () => _run(context, ref, () => repo.declineInvitation(id)),
                  child: const Text('Decline'),
                ),
              ],
            )
          : null,
    );
  }
}

Future<void> _createProfileDialog(BuildContext context, WidgetRef ref) async {
  final nameCtrl = TextEditingController();
  final currencyCtrl = TextEditingController(text: 'USD');
  final ok = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: const Text('New shared profile'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          TextField(controller: nameCtrl, decoration: const InputDecoration(labelText: 'Name')),
          TextField(controller: currencyCtrl, decoration: const InputDecoration(labelText: 'Currency (ISO 4217)')),
        ],
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
        FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Create')),
      ],
    ),
  );
  if (ok != true) return;
  await _run(context, ref, () async {
    await ref.read(profileRepositoryProvider).createSharedProfile(
          name: nameCtrl.text.trim(),
          baseCurrency: currencyCtrl.text.trim().toUpperCase(),
        );
  });
}

/// Member-management view for a single profile.
class ProfileMembersScreen extends ConsumerWidget {
  const ProfileMembersScreen({super.key, required this.profileId});

  final String profileId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profile = ref.watch(sharedProfileProvider(profileId));
    return Scaffold(
      appBar: AppBar(
        title: const Text('Members'),
        actions: [
          IconButton(
            tooltip: 'Archive profile',
            icon: const Icon(Icons.archive_outlined),
            onPressed: () => _run(context, ref, () async {
              await ref.read(profileRepositoryProvider).archiveProfile(profileId);
              ref.invalidate(sharedProfileProvider(profileId));
            }),
          ),
        ],
      ),
      body: profile.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('$e')),
        data: (p) {
          if (p == null) return const Center(child: Text('Profile not found or no access'));
          final members = List<Map<String, dynamic>>.from(p['members'] as List<dynamic>);
          final archived = p['status'] == 'ARCHIVED';
          return Column(
            children: [
              if (archived)
                const Material(
                  color: Color(0xFFFFF3E0),
                  child: Padding(
                    padding: EdgeInsets.all(12),
                    child: Text('This profile is archived (read-only).'),
                  ),
                ),
              Expanded(
                child: ListView(
                  children: [
                    for (final m in members) _MemberRow(profileId: profileId, member: m, readOnly: archived),
                  ],
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _MemberRow extends ConsumerWidget {
  const _MemberRow({required this.profileId, required this.member, required this.readOnly});

  final String profileId;
  final Map<String, dynamic> member;
  final bool readOnly;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = member['user'] as Map<String, dynamic>;
    final role = member['role'] as String;
    final version = member['version'] as int;
    final id = member['id'] as String;
    final repo = ref.read(profileRepositoryProvider);

    return ListTile(
      title: Text(user['displayName'] as String? ?? user['id'] as String),
      subtitle: Text('$role · v$version · ${member['status']}'),
      trailing: (readOnly || role == 'OWNER')
          ? null
          : PopupMenuButton<String>(
              onSelected: (action) async {
                if (action == 'transfer') {
                  await _run(context, ref, () async {
                    await repo.nominateOwner(sharedProfileId: profileId, nomineeMembershipId: id);
                    ref.invalidate(sharedProfileProvider(profileId));
                  });
                  return;
                }
                await _run(context, ref, () async {
                  // Pass the version we read; a CONFLICT means refetch and retry (FR-006a).
                  await repo.changeMemberRole(membershipId: id, role: action, expectedVersion: version);
                  ref.invalidate(sharedProfileProvider(profileId));
                });
              },
              itemBuilder: (_) => [
                for (final r in _roles)
                  if (r != role) PopupMenuItem(value: r, child: Text('Make $r')),
                const PopupMenuItem(value: 'transfer', child: Text('Nominate as owner')),
              ],
            ),
    );
  }
}

/// Run an action, mapping server domain errors to user-facing feedback.
Future<void> _run(BuildContext context, WidgetRef ref, Future<void> Function() action) async {
  final messenger = ScaffoldMessenger.of(context);
  try {
    await action();
    ref.invalidate(myMembershipsProvider);
    messenger.showSnackBar(const SnackBar(content: Text('Done')));
  } on ProfileException catch (e) {
    final msg = e.isConflict
        ? 'Someone else just changed this — please refresh and try again.'
        : e.isForbidden
            ? 'You do not have permission for that.'
            : e.isArchived
                ? 'This profile is archived (read-only).'
                : e.message;
    messenger.showSnackBar(SnackBar(content: Text(msg)));
  }
}
