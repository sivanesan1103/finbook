import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../core/api_client.dart';
import '../core/theme.dart';
import '../l10n/translations.dart';
import '../models/models.dart';
import '../providers/app_state.dart';
import '../widgets/common.dart';

class StaffScreen extends StatefulWidget {
  const StaffScreen({super.key});
  @override
  State<StaffScreen> createState() => _StaffScreenState();
}

class _StaffScreenState extends State<StaffScreen> {
  List<StaffMember> members = [];
  bool loading = true;
  bool get _isOwner => context.read<AppState>().business?.role == 'OWNER';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final app = context.read<AppState>();
    setState(() => loading = true);
    try {
      final res = await ApiClient.instance.get('${app.basePath}/staff');
      if (!mounted) return;
      setState(() {
        members = (res['data'] as List).map((m) => StaffMember.fromJson(m)).toList();
        loading = false;
      });
    } catch (e) {
      if (mounted) { setState(() => loading = false); showSnack(context, e.toString(), error: true); }
    }
  }

  Future<void> _add() async {
    final isOwner = _isOwner;
    final email = TextEditingController();
    final name = TextEditingController();
    final password = TextEditingController();
    String role = 'STAFF';
    final perms = {'parties': true, 'bills': true, 'items': false, 'cashbook': false, 'expenses': false, 'reports': false};
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setD) => AlertDialog(
          title: Text(context.tr('staff.addTitle')),
          content: SingleChildScrollView(
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
              TextField(controller: email, keyboardType: TextInputType.emailAddress,
                  onChanged: (_) => setD(() {}),
                  decoration: InputDecoration(labelText: context.tr('staff.emailAddress'))),
              const SizedBox(height: 12),
              // Setting a name/password directly mints login credentials, so
              // that capability is owner-only — the same rule the backend
              // enforces (POST /staff is OWNER-only) — partners can still
              // invite by email and the invitee registers themselves. When
              // the owner IS setting it up directly, the password is
              // mandatory — there's no point in an owner-initiated flow
              // that leaves the account passwordless.
              if (isOwner) ...[
                TextField(controller: name, decoration: InputDecoration(labelText: context.tr('staff.nameOptional'))),
                const SizedBox(height: 12),
                TextField(controller: password, obscureText: true,
                    onChanged: (_) => setD(() {}),
                    decoration: InputDecoration(labelText: context.tr('staff.password'))),
                const SizedBox(height: 6),
                Text(context.tr('staff.passwordRequiredHint'),
                    style: const TextStyle(fontSize: 11, color: Colors.black45)),
                const SizedBox(height: 12),
              ] else ...[
                Text(context.tr('staff.partnerInviteHint'),
                    style: const TextStyle(fontSize: 11, color: Colors.black45)),
                const SizedBox(height: 12),
              ],
              DropdownButtonFormField<String>(
                value: role,
                decoration: InputDecoration(labelText: context.tr('staff.role')),
                items: [
                  DropdownMenuItem(value: 'STAFF', child: Text(context.tr('staff.roleStaff'))),
                  DropdownMenuItem(value: 'PARTNER', child: Text(context.tr('staff.rolePartner'))),
                ],
                onChanged: (v) => setD(() => role = v!),
              ),
              if (role == 'STAFF') ...[
                const SizedBox(height: 16),
                Text(context.tr('staff.permissions'),
                    style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12)),
                const SizedBox(height: 8),
                _PermissionGrid(perms: perms, onToggle: (f, v) => setD(() => perms[f] = v)),
              ],
            ]),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(context.tr('common.cancel'))),
            ElevatedButton(
              onPressed: (email.text.trim().isNotEmpty && (!isOwner || password.text.trim().isNotEmpty))
                  ? () => Navigator.pop(ctx, true)
                  : null,
              child: Text(context.tr('staff.add')),
            ),
          ],
        ),
      ),
    );
    if (ok != true || email.text.trim().isEmpty || !mounted) return;
    try {
      final app = context.read<AppState>();
      final res = await ApiClient.instance.post('${app.basePath}/staff', {
        'email': email.text.trim(),
        if (name.text.trim().isNotEmpty) 'name': name.text.trim(),
        if (password.text.trim().isNotEmpty) 'password': password.text.trim(),
        'role': role,
        if (role == 'STAFF') 'permissions': perms,
      });
      if (res['data']?['passwordSet'] == true && mounted) {
        await showDialog<void>(
          context: context,
          builder: (ctx) => AlertDialog(
            title: Text(context.tr('staff.credentialsTitle')),
            content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(context.tr('staff.credentialsSubtitle')),
              const SizedBox(height: 10),
              SelectableText('${context.tr('common.email')}: ${email.text.trim()}'),
              SelectableText('${context.tr('staff.password')}: ${password.text.trim()}',
                  style: const TextStyle(fontWeight: FontWeight.w700)),
            ]),
            actions: [
              TextButton(onPressed: () => Navigator.pop(ctx), child: Text(context.tr('common.close'))),
            ],
          ),
        );
      }
      _load();
    } catch (e) {
      if (mounted) showSnack(context, e.toString(), error: true);
    }
  }

  Future<void> _editPermissions(StaffMember m) async {
    final perms = {for (final f in kPermissionFlags) f: m.permissions[f] ?? false};
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setD) => AlertDialog(
          title: Text(context.tr('staff.editPermissionsTitle', {'name': m.userName})),
          content: SingleChildScrollView(
            child: _PermissionGrid(perms: perms, onToggle: (f, v) => setD(() => perms[f] = v)),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(context.tr('common.cancel'))),
            ElevatedButton(onPressed: () => Navigator.pop(ctx, true), child: Text(context.tr('common.save'))),
          ],
        ),
      ),
    );
    if (ok != true || !mounted) return;
    try {
      final app = context.read<AppState>();
      await ApiClient.instance.patch('${app.basePath}/staff/${m.id}', {'permissions': perms});
      _load();
    } catch (e) {
      if (mounted) showSnack(context, e.toString(), error: true);
    }
  }

  Future<void> _remove(StaffMember m) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(context.tr('staff.confirmRemove', {'name': m.userName})),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(context.tr('common.cancel'))),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: Text(context.tr('staff.remove'))),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    try {
      final app = context.read<AppState>();
      await ApiClient.instance.delete('${app.basePath}/staff/${m.id}');
      _load();
    } catch (e) {
      if (mounted) showSnack(context, e.toString(), error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.surface,
      appBar: AppBar(title: Text(context.tr('staff.title'))),
      // Adding a member sets their password, so it's OWNER-only server-side
      // (POST /staff) — hide the entry point for PARTNERs instead of letting
      // them fill the whole dialog out just to hit a 403 on submit.
      floatingActionButton: _isOwner
          ? FloatingActionButton.extended(
              backgroundColor: AppColors.primary,
              onPressed: _add,
              icon: const Icon(Icons.person_add, color: Colors.white),
              label: Text(context.tr('staff.addStaff'), style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800)),
            )
          : null,
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : members.isEmpty
              ? Center(
                  child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                    const Icon(Icons.people_outline, size: 64, color: Colors.black12),
                    const SizedBox(height: 8),
                    Text(context.tr('staff.noStaffYet'), style: const TextStyle(fontWeight: FontWeight.w700)),
                    Text(context.tr('staff.inviteSubtitle'),
                        style: const TextStyle(color: Colors.black45, fontSize: 12)),
                  ]),
                )
              : ListView.separated(
                  padding: const EdgeInsets.only(bottom: 90),
                  itemCount: members.length,
                  separatorBuilder: (_, __) => const Divider(height: 1),
                  itemBuilder: (_, i) {
                    final m = members[i];
                    final canEditPerms = m.role == 'STAFF';
                    return ListTile(
                      tileColor: Colors.white,
                      onTap: canEditPerms ? () => _editPermissions(m) : null,
                      leading: InitialAvatar(m.userName.isEmpty ? (m.userEmail ?? '?') : m.userName),
                      title: Text(m.userName.isEmpty ? (m.userEmail ?? '') : m.userName,
                          style: const TextStyle(fontWeight: FontWeight.w700)),
                      subtitle: Text(canEditPerms
                          ? context.tr('staff.tapToEditPermissions')
                          : (m.userEmail ?? m.userPhone ?? '')),
                      trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                          decoration: BoxDecoration(
                              color: AppColors.primary.withOpacity(0.1), borderRadius: BorderRadius.circular(6)),
                          child: Text(m.role, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: AppColors.primary)),
                        ),
                        if (m.role != 'OWNER')
                          IconButton(icon: const Icon(Icons.close, size: 18, color: Colors.black38), onPressed: () => _remove(m)),
                      ]),
                    );
                  },
                ),
    );
  }
}

/// Compact 2-column permission toggle grid — used by both the add-staff
/// dialog and the edit-permissions dialog so they stay visually consistent.
/// Replaces the old single-column CheckboxListTile list, which wasted
/// vertical space (full ListTile row height per flag) and didn't line up
/// into columns despite intending to via Wrap.
class _PermissionGrid extends StatelessWidget {
  final Map<String, bool> perms;
  final void Function(String flag, bool value) onToggle;
  const _PermissionGrid({required this.perms, required this.onToggle});

  Widget _chip(BuildContext context, String f) {
    final checked = perms[f] ?? false;
    return Expanded(
      child: InkWell(
        borderRadius: BorderRadius.circular(8),
        onTap: () => onToggle(f, !checked),
        child: Container(
          height: 40,
          padding: const EdgeInsets.symmetric(horizontal: 10),
          decoration: BoxDecoration(
            border: Border.all(color: checked ? AppColors.primary : Colors.black12),
            borderRadius: BorderRadius.circular(8),
            color: checked ? AppColors.primary.withOpacity(0.06) : Colors.transparent,
          ),
          child: Row(children: [
            Icon(checked ? Icons.check_box : Icons.check_box_outline_blank,
                size: 18, color: checked ? AppColors.primary : Colors.black38),
            const SizedBox(width: 6),
            Expanded(
              child: Text(context.tr('staff.flag$f'),
                  style: TextStyle(fontSize: 13, fontWeight: checked ? FontWeight.w700 : FontWeight.w500),
                  overflow: TextOverflow.ellipsis),
            ),
          ]),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    // A fixed 2-per-row Column of Rows — not GridView (doesn't support the
    // intrinsic-width pass AlertDialog uses to size itself, and throws a
    // layout exception the moment the dialog opens) and not Wrap (only
    // wraps to 2 columns if the dialog happens to be wide enough; a plain
    // Row guarantees exactly 2 columns regardless of dialog width).
    final rows = <Widget>[];
    for (var i = 0; i < kPermissionFlags.length; i += 2) {
      final second = i + 1 < kPermissionFlags.length ? kPermissionFlags[i + 1] : null;
      rows.add(Padding(
        padding: EdgeInsets.only(bottom: i + 2 < kPermissionFlags.length ? 8 : 0),
        child: Row(children: [
          _chip(context, kPermissionFlags[i]),
          const SizedBox(width: 8),
          if (second != null) _chip(context, second) else const Spacer(),
        ]),
      ));
    }
    return Column(children: rows);
  }
}
