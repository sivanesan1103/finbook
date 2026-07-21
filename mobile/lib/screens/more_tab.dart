import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../core/api_client.dart';
import '../core/theme.dart';
import '../l10n/translations.dart';
import '../providers/app_state.dart';
import '../providers/locale_provider.dart';
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
        title: Text(context.tr('more.myProfile')),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          TextField(controller: name, decoration: InputDecoration(labelText: context.tr('more.name'))),
          const SizedBox(height: 10),
          TextField(controller: email, decoration: InputDecoration(labelText: context.tr('more.emailField'))),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(context.tr('common.cancel'))),
          ElevatedButton(onPressed: () => Navigator.pop(ctx, true), child: Text(context.tr('common.save'))),
        ],
      ),
    );
    if (ok != true || !context.mounted) return;
    try {
      await ApiClient.instance.patch('/auth/me', {
        'name': name.text.trim(),
        if (email.text.trim().isNotEmpty) 'email': email.text.trim(),
      });
      if (context.mounted) showSnack(context, context.tr('more.profileUpdated'));
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
          Text(context.tr('more.notificationsTitle'), style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
          if (list.isEmpty) Padding(
            padding: const EdgeInsets.all(24),
            child: Center(child: Text(context.tr('more.noNotifications'))),
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

  Future<void> _pickLanguage(BuildContext context) async {
    final locale = context.read<LocaleProvider>();
    await showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const SizedBox(height: 8),
          Text(context.tr('more.language'), style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
          RadioListTile<String>(
            title: Text(context.tr('settings.english')),
            value: 'en',
            groupValue: locale.code,
            onChanged: (v) { locale.setLang('en'); Navigator.pop(ctx); },
          ),
          RadioListTile<String>(
            title: Text(context.tr('settings.tamil')),
            value: 'ta',
            groupValue: locale.code,
            onChanged: (v) { locale.setLang('ta'); Navigator.pop(ctx); },
          ),
          const SizedBox(height: 8),
        ]),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    final locale = context.watch<LocaleProvider>();
    return Scaffold(
      backgroundColor: AppColors.surface,
      appBar: AppBar(title: Text(context.tr('more.title'))),
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
            TextButton(onPressed: () => _editProfile(context), child: Text(context.tr('more.edit'))),
          ]),
        ),
        const SizedBox(height: 10),
        Container(
          color: Colors.white,
          child: Column(children: [
            ListTile(
              leading: const Icon(Icons.inventory_2_outlined, color: AppColors.primary),
              title: Text(context.tr('more.itemsInventory')),
              subtitle: Text(context.tr('more.itemsInventorySubtitle')),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const ItemsTab())),
            ),
            const Divider(height: 1),
            ListTile(
              leading: const Icon(Icons.bar_chart_outlined, color: AppColors.primary),
              title: Text(context.tr('more.reports')),
              subtitle: Text(context.tr('more.reportsSubtitle')),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const ReportsScreen())),
            ),
            const Divider(height: 1),
            ListTile(
              leading: const Icon(Icons.badge_outlined, color: AppColors.primary),
              title: Text(context.tr('more.staff')),
              subtitle: Text(context.tr('more.staffSubtitle')),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const StaffScreen())),
            ),
            const Divider(height: 1),
            ListTile(
              leading: const Icon(Icons.settings_outlined, color: AppColors.primary),
              title: Text(context.tr('more.settings')),
              subtitle: Text(context.tr('more.settingsSubtitle', {'business': app.business?.name ?? ''})),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const SettingsScreen())),
            ),
            const Divider(height: 1),
            ListTile(
              leading: const Icon(Icons.language, color: AppColors.primary),
              title: Text(context.tr('more.language')),
              subtitle: Text(locale.code == 'ta' ? context.tr('settings.tamil') : context.tr('settings.english')),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => _pickLanguage(context),
            ),
            const Divider(height: 1),
            ListTile(
              leading: const Icon(Icons.notifications_outlined, color: AppColors.primary),
              title: Text(context.tr('more.notifications')),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => _notifications(context),
            ),
            const Divider(height: 1),
            ListTile(
              leading: const Icon(Icons.help_outline, color: AppColors.primary),
              title: Text(context.tr('more.helpSupport')),
              subtitle: Text(context.tr('more.helpSupportSubtitle')),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => showSnack(context, context.tr('more.helpSupportSnack')),
            ),
          ]),
        ),
        const SizedBox(height: 10),
        Container(
          color: Colors.white,
          child: ListTile(
            leading: const Icon(Icons.logout, color: Colors.red),
            title: Text(context.tr('more.logout'), style: const TextStyle(color: Colors.red)),
            onTap: () => app.logout(),
          ),
        ),
        Padding(
          padding: const EdgeInsets.all(20),
          child: Center(
            child: Text(context.tr('more.versionFooter'),
                style: const TextStyle(color: Colors.black38, fontSize: 12)),
          ),
        ),
      ]),
    );
  }
}
