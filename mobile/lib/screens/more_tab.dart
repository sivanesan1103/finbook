import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../core/api_client.dart';
import '../core/theme.dart';
import '../providers/app_state.dart';
import '../widgets/common.dart';
import 'items_tab.dart';
import 'staff_screen.dart';
import 'reports_screen.dart';
import 'settings_screen.dart';

class MoreTab extends StatelessWidget {
  const MoreTab({super.key});

  Future<void> _editProfile(BuildContext context) async {
    final app = context.read<AppState>();
    final name = TextEditingController(text: app.user?.name);
    final email = TextEditingController(text: app.user?.email ?? '');
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('My Profile'),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          TextField(controller: name, decoration: const InputDecoration(labelText: 'Name')),
          const SizedBox(height: 10),
          TextField(controller: email, decoration: const InputDecoration(labelText: 'Email')),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          ElevatedButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Save')),
        ],
      ),
    );
    if (ok != true || !context.mounted) return;
    try {
      await ApiClient.instance.patch('/auth/me', {
        'name': name.text.trim(),
        if (email.text.trim().isNotEmpty) 'email': email.text.trim(),
      });
      if (context.mounted) showSnack(context, 'Profile updated');
    } catch (e) {
      if (context.mounted) showSnack(context, e.toString(), error: true);
    }
  }

  Future<void> _notifications(BuildContext context) async {
    final res = await ApiClient.instance.get('/notifications');
    if (!context.mounted) return;
    final list = res['data'] as List;
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => ListView(
        shrinkWrap: true,
        padding: const EdgeInsets.all(16),
        children: [
          const Text('Notifications', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
          if (list.isEmpty) const Padding(
            padding: EdgeInsets.all(24),
            child: Center(child: Text('No notifications yet')),
          ),
          ...list.map((n) => ListTile(
                leading: Icon(
                  n['readAt'] == null ? Icons.notifications_active : Icons.notifications_none,
                  color: n['readAt'] == null ? AppColors.primary : Colors.grey,
                ),
                title: Text(n['title'] ?? ''),
                subtitle: Text(n['body'] ?? ''),
              )),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    return Scaffold(
      backgroundColor: AppColors.surface,
      appBar: AppBar(title: const Text('More')),
      body: ListView(children: [
        Container(
          color: Colors.white,
          padding: const EdgeInsets.all(16),
          child: Row(children: [
            InitialAvatar(app.user?.name ?? '?', radius: 28),
            const SizedBox(width: 14),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(app.user?.name ?? '', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
                Text(app.user?.phone ?? app.user?.email ?? '', style: const TextStyle(color: Colors.black54)),
              ]),
            ),
            TextButton(onPressed: () => _editProfile(context), child: const Text('EDIT')),
          ]),
        ),
        const SizedBox(height: 10),
        Container(
          color: Colors.white,
          child: Column(children: [
            ListTile(
              leading: const Icon(Icons.inventory_2_outlined, color: AppColors.primary),
              title: const Text('Items & Inventory'),
              subtitle: const Text('Products, services and stock'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const ItemsTab())),
            ),
            const Divider(height: 1),
            ListTile(
              leading: const Icon(Icons.bar_chart_outlined, color: AppColors.primary),
              title: const Text('Reports'),
              subtitle: const Text('Ledger, sales, cashbook and expense totals'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const ReportsScreen())),
            ),
            const Divider(height: 1),
            ListTile(
              leading: const Icon(Icons.badge_outlined, color: AppColors.primary),
              title: const Text('Staff'),
              subtitle: const Text('Manage partners and staff access'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const StaffScreen())),
            ),
            const Divider(height: 1),
            ListTile(
              leading: const Icon(Icons.settings_outlined, color: AppColors.primary),
              title: const Text('Settings'),
              subtitle: Text('${app.business?.name ?? ''} · invoicing · backup & restore'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const SettingsScreen())),
            ),
            const Divider(height: 1),
            ListTile(
              leading: const Icon(Icons.notifications_outlined, color: AppColors.primary),
              title: const Text('Notifications'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => _notifications(context),
            ),
            const Divider(height: 1),
            ListTile(
              leading: const Icon(Icons.help_outline, color: AppColors.primary),
              title: const Text('Help & Support'),
              subtitle: const Text('Understand how FinBook works'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => showSnack(context, 'FinBook — your digital business ledger.'),
            ),
          ]),
        ),
        const SizedBox(height: 10),
        Container(
          color: Colors.white,
          child: ListTile(
            leading: const Icon(Icons.logout, color: Colors.red),
            title: const Text('Logout', style: TextStyle(color: Colors.red)),
            onTap: () => app.logout(),
          ),
        ),
        const Padding(
          padding: EdgeInsets.all(20),
          child: Center(
            child: Text('FinBook v1.0.0 · Made with Flutter',
                style: TextStyle(color: Colors.black38, fontSize: 12)),
          ),
        ),
      ]),
    );
  }
}
