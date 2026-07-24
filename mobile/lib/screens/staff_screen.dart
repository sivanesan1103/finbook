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
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              TextField(controller: email, keyboardType: TextInputType.emailAddress,
                  decoration: InputDecoration(labelText: context.tr('staff.emailAddress'))),
              const SizedBox(height: 10),
              TextField(controller: name, decoration: InputDecoration(labelText: context.tr('staff.nameOptional'))),
              const SizedBox(height: 10),
              TextField(controller: password,
                  decoration: InputDecoration(labelText: context.tr('staff.passwordOptional'))),
              Align(
                alignment: Alignment.centerLeft,
                child: Padding(
                  padding: const EdgeInsets.only(top: 2, bottom: 4),
                  child: Text(context.tr('staff.passwordHint'),
                      style: const TextStyle(fontSize: 11, color: Colors.black45)),
                ),
              ),
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
                const SizedBox(height: 10),
                Align(alignment: Alignment.centerLeft, child: Text(context.tr('staff.permissions'),
                    style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12))),
                Wrap(
                  children: kPermissionFlags.map((f) => SizedBox(
                    width: 160,
                    child: CheckboxListTile(
                      dense: true,
                      contentPadding: EdgeInsets.zero,
                      controlAffinity: ListTileControlAffinity.leading,
                      title: Text(context.tr('staff.flag$f'), style: const TextStyle(fontSize: 13)),
                      value: perms[f],
                      onChanged: (v) => setD(() => perms[f] = v ?? false),
                    ),
                  )).toList(),
                ),
              ],
            ]),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(context.tr('common.cancel'))),
            ElevatedButton(onPressed: () => Navigator.pop(ctx, true), child: Text(context.tr('staff.add'))),
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
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: kPermissionFlags.map((f) => CheckboxListTile(
              dense: true,
              contentPadding: EdgeInsets.zero,
              controlAffinity: ListTileControlAffinity.leading,
              title: Text(context.tr('staff.flag$f')),
              value: perms[f],
              onChanged: (v) => setD(() => perms[f] = v ?? false),
            )).toList(),
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
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: AppColors.primary,
        onPressed: _add,
        icon: const Icon(Icons.person_add, color: Colors.white),
        label: Text(context.tr('staff.addStaff'), style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800)),
      ),
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
