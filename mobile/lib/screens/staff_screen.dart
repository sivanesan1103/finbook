import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../core/api_client.dart';
import '../core/theme.dart';
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
    String role = 'STAFF';
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setD) => AlertDialog(
          title: const Text('Add Staff / Partner'),
          content: Column(mainAxisSize: MainAxisSize.min, children: [
            TextField(controller: email, keyboardType: TextInputType.emailAddress,
                decoration: const InputDecoration(labelText: 'Email address')),
            const SizedBox(height: 10),
            TextField(controller: name, decoration: const InputDecoration(labelText: 'Name (optional)')),
            const SizedBox(height: 10),
            DropdownButtonFormField<String>(
              value: role,
              decoration: const InputDecoration(labelText: 'Role'),
              items: const [
                DropdownMenuItem(value: 'STAFF', child: Text('Staff')),
                DropdownMenuItem(value: 'PARTNER', child: Text('Partner')),
              ],
              onChanged: (v) => setD(() => role = v!),
            ),
          ]),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
            ElevatedButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Add')),
          ],
        ),
      ),
    );
    if (ok != true || email.text.trim().isEmpty || !mounted) return;
    try {
      final app = context.read<AppState>();
      await ApiClient.instance.post('${app.basePath}/staff', {
        'email': email.text.trim(),
        if (name.text.trim().isNotEmpty) 'name': name.text.trim(),
        'role': role,
      });
      _load();
    } catch (e) {
      if (mounted) showSnack(context, e.toString(), error: true);
    }
  }

  Future<void> _remove(StaffMember m) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Remove ${m.userName}?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Remove')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    final app = context.read<AppState>();
    await ApiClient.instance.delete('${app.basePath}/staff/${m.id}');
    _load();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.surface,
      appBar: AppBar(title: const Text('Staff')),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: AppColors.primary,
        onPressed: _add,
        icon: const Icon(Icons.person_add, color: Colors.white),
        label: const Text('ADD STAFF', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800)),
      ),
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : members.isEmpty
              ? const Center(
                  child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                    Icon(Icons.people_outline, size: 64, color: Colors.black12),
                    SizedBox(height: 8),
                    Text('No staff added yet', style: TextStyle(fontWeight: FontWeight.w700)),
                    Text('Invite partners or staff to help run this book',
                        style: TextStyle(color: Colors.black45, fontSize: 12)),
                  ]),
                )
              : ListView.separated(
                  padding: const EdgeInsets.only(bottom: 90),
                  itemCount: members.length,
                  separatorBuilder: (_, __) => const Divider(height: 1),
                  itemBuilder: (_, i) {
                    final m = members[i];
                    return ListTile(
                      tileColor: Colors.white,
                      leading: InitialAvatar(m.userName.isEmpty ? (m.userEmail ?? '?') : m.userName),
                      title: Text(m.userName.isEmpty ? (m.userEmail ?? '') : m.userName,
                          style: const TextStyle(fontWeight: FontWeight.w700)),
                      subtitle: Text(m.userEmail ?? m.userPhone ?? ''),
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
