import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../core/api_client.dart';
import '../core/theme.dart';
import '../l10n/translations.dart';
import '../models/models.dart';
import '../providers/app_state.dart';
import '../widgets/common.dart';

class PartyProfileScreen extends StatefulWidget {
  final Party party;
  const PartyProfileScreen({super.key, required this.party});

  @override
  State<PartyProfileScreen> createState() => _PartyProfileScreenState();
}

class _PartyProfileScreenState extends State<PartyProfileScreen> {
  late Party party = widget.party;
  bool deleting = false;

  Future<void> _editField(String label, String field, String? current,
      {TextInputType? keyboard}) async {
    final ctrl = TextEditingController(text: current ?? '');
    final value = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(context.tr('partyProfile.editLabel', {'label': label})),
        content: TextField(controller: ctrl, autofocus: true, keyboardType: keyboard),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: Text(context.tr('partyProfile.cancel'))),
          ElevatedButton(onPressed: () => Navigator.pop(ctx, ctrl.text.trim()), child: Text(context.tr('partyProfile.save'))),
        ],
      ),
    );
    if (value == null || !mounted) return;
    await _update({field: value});
  }

  Future<void> _update(Map<String, dynamic> patch) async {
    try {
      final app = context.read<AppState>();
      final res = await ApiClient.instance.patch('${app.basePath}/parties/${party.id}', patch);
      final data = Map<String, dynamic>.from(res['data']);
      data['balance'] = 0;
      if (mounted) setState(() => party = Party.fromJson(data));
    } catch (e) {
      if (mounted) showSnack(context, e.toString(), error: true);
    }
  }

  Future<void> _delete() async {
    if (deleting) return;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(context.tr('partyProfile.confirmDeleteTitle', {'name': party.name})),
        content: Text(context.tr('partyProfile.confirmDeleteBody')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(context.tr('partyProfile.cancel'))),
          TextButton(onPressed: () => Navigator.pop(ctx, true),
              child: Text(context.tr('partyProfile.delete'), style: const TextStyle(color: Colors.red))),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() => deleting = true);
    try {
      final app = context.read<AppState>();
      await ApiClient.instance.delete('${app.basePath}/parties/${party.id}');
      if (mounted) Navigator.of(context)..pop()..pop();
    } catch (e) {
      if (mounted) {
        showSnack(context, e.toString(), error: true);
        setState(() => deleting = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final isCustomer = party.type == 'CUSTOMER';
    final typeLabel = isCustomer ? context.tr('partyProfile.customer') : context.tr('partyProfile.supplier');
    return Scaffold(
      backgroundColor: AppColors.surface,
      appBar: AppBar(title: Text(isCustomer ? context.tr('partyProfile.customerProfile') : context.tr('partyProfile.supplierProfile'))),
      body: ListView(children: [
        Container(
          color: Colors.white,
          padding: const EdgeInsets.symmetric(vertical: 20),
          child: Column(children: [
            Stack(alignment: Alignment.bottomRight, children: [
              InitialAvatar(party.name, radius: 46),
              const CircleAvatar(
                radius: 15,
                backgroundColor: AppColors.primary,
                child: Icon(Icons.photo_camera, color: Colors.white, size: 16),
              ),
            ]),
            const SizedBox(height: 8),
            Text(context.tr('partyProfile.addPhoto'), style: const TextStyle(color: AppColors.primary, fontWeight: FontWeight.w600)),
            const SizedBox(height: 12),
            OutlinedButton.icon(
              onPressed: () => showSnack(context, context.tr('partyProfile.shareBusinessCardSnack')),
              icon: const Icon(Icons.badge_outlined),
              label: Text(context.tr('partyProfile.shareBusinessCard')),
            ),
          ]),
        ),
        const SizedBox(height: 10),
        Container(
          color: Colors.white,
          child: Column(children: [
            ListTile(
              leading: const Icon(Icons.person_outline),
              title: Text(context.tr('partyProfile.name'), style: const TextStyle(fontSize: 12, color: Colors.black45)),
              subtitle: Text(party.name, style: const TextStyle(fontSize: 16, color: Colors.black87)),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => _editField(context.tr('partyProfile.name'), 'name', party.name),
            ),
            const Divider(height: 1),
            ListTile(
              leading: const Icon(Icons.call_outlined),
              title: Text(context.tr('partyProfile.mobileNumber'), style: const TextStyle(fontSize: 12, color: Colors.black45)),
              subtitle: Text(party.phone ?? context.tr('partyProfile.addMobileNumber'),
                  style: const TextStyle(fontSize: 16, color: Colors.black87)),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => _editField(context.tr('partyProfile.mobileNumber'), 'phone', party.phone, keyboard: TextInputType.phone),
            ),
            const Divider(height: 1),
            ListTile(
              leading: const Icon(Icons.location_on_outlined),
              title: Text(context.tr('partyProfile.address'), style: const TextStyle(fontSize: 12, color: Colors.black45)),
              subtitle: Text(party.address.isEmpty ? context.tr('partyProfile.addAddress') : party.address,
                  style: const TextStyle(fontSize: 16, color: Colors.black87)),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => _editField(context.tr('partyProfile.address'), 'addressLine', party.addressLine),
            ),
            const Divider(height: 1),
            ListTile(
              leading: const Icon(Icons.description_outlined),
              title: Text(party.gstin?.isNotEmpty == true ? party.gstin! : context.tr('partyProfile.gstin'),
                  style: const TextStyle(fontSize: 16)),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => _editField(context.tr('partyProfile.gstin'), 'gstin', party.gstin),
            ),
          ]),
        ),
        Padding(
          padding: const EdgeInsets.all(16),
          child: OutlinedButton.icon(
            onPressed: deleting ? null : _delete,
            icon: const Icon(Icons.delete_outline, color: Colors.red),
            label: Text(context.tr('partyProfile.deleteType', {'type': typeLabel.toUpperCase()}),
                style: const TextStyle(color: Colors.red, fontWeight: FontWeight.w700)),
            style: OutlinedButton.styleFrom(
                side: const BorderSide(color: Colors.red), minimumSize: const Size.fromHeight(50)),
          ),
        ),
      ]),
    );
  }
}
