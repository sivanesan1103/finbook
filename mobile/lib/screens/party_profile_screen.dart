import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../core/api_client.dart';
import '../core/theme.dart';
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

  Future<void> _editField(String label, String field, String? current,
      {TextInputType? keyboard}) async {
    final ctrl = TextEditingController(text: current ?? '');
    final value = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Edit $label'),
        content: TextField(controller: ctrl, autofocus: true, keyboardType: keyboard),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          ElevatedButton(onPressed: () => Navigator.pop(ctx, ctrl.text.trim()), child: const Text('Save')),
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
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Delete ${party.name}?'),
        content: const Text('The khata and its entries will be soft-deleted.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Delete', style: TextStyle(color: Colors.red))),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    final app = context.read<AppState>();
    await ApiClient.instance.delete('${app.basePath}/parties/${party.id}');
    if (mounted) Navigator.of(context)..pop()..pop();
  }

  @override
  Widget build(BuildContext context) {
    final isCustomer = party.type == 'CUSTOMER';
    return Scaffold(
      backgroundColor: AppColors.surface,
      appBar: AppBar(title: Text(isCustomer ? 'Customer Profile' : 'Supplier Profile')),
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
            const Text('Add photo', style: TextStyle(color: AppColors.primary, fontWeight: FontWeight.w600)),
            const SizedBox(height: 12),
            OutlinedButton.icon(
              onPressed: () => showSnack(context, 'Business card sharing is WhatsApp-gateway ready.'),
              icon: const Icon(Icons.badge_outlined),
              label: const Text('SHARE YOUR BUSINESS CARD'),
            ),
          ]),
        ),
        const SizedBox(height: 10),
        Container(
          color: Colors.white,
          child: Column(children: [
            ListTile(
              leading: const Icon(Icons.person_outline),
              title: const Text('Name', style: TextStyle(fontSize: 12, color: Colors.black45)),
              subtitle: Text(party.name, style: const TextStyle(fontSize: 16, color: Colors.black87)),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => _editField('Name', 'name', party.name),
            ),
            const Divider(height: 1),
            ListTile(
              leading: const Icon(Icons.call_outlined),
              title: const Text('Mobile Number', style: TextStyle(fontSize: 12, color: Colors.black45)),
              subtitle: Text(party.phone ?? 'Add mobile number',
                  style: const TextStyle(fontSize: 16, color: Colors.black87)),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => _editField('Mobile Number', 'phone', party.phone, keyboard: TextInputType.phone),
            ),
            const Divider(height: 1),
            ListTile(
              leading: const Icon(Icons.location_on_outlined),
              title: const Text('Address', style: TextStyle(fontSize: 12, color: Colors.black45)),
              subtitle: Text(party.address.isEmpty ? 'Add address' : party.address,
                  style: const TextStyle(fontSize: 16, color: Colors.black87)),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => _editField('Address', 'addressLine', party.addressLine),
            ),
            const Divider(height: 1),
            ListTile(
              leading: const Icon(Icons.description_outlined),
              title: Text(party.gstin?.isNotEmpty == true ? party.gstin! : 'GSTIN',
                  style: const TextStyle(fontSize: 16)),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => _editField('GSTIN', 'gstin', party.gstin),
            ),
            const Divider(height: 1),
            ListTile(
              leading: const Icon(Icons.swap_horiz),
              title: Text('Change to ${isCustomer ? 'Supplier' : 'Customer'}',
                  style: const TextStyle(fontSize: 16)),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => _update({'type': isCustomer ? 'SUPPLIER' : 'CUSTOMER'}),
            ),
          ]),
        ),
        const SizedBox(height: 10),
        Container(
          color: Colors.white,
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
              child: Text('${isCustomer ? 'Customer' : 'Supplier'} Settings',
                  style: const TextStyle(color: Colors.black45, fontSize: 13)),
            ),
            SwitchListTile(
              secondary: const Icon(Icons.sms_outlined),
              title: const Text('SMS Settings'),
              subtitle: const Text('SMS will be sent on each entry'),
              value: party.smsEnabled,
              onChanged: (v) => _update({'smsEnabled': v}),
            ),
          ]),
        ),
        Padding(
          padding: const EdgeInsets.all(16),
          child: OutlinedButton.icon(
            onPressed: _delete,
            icon: const Icon(Icons.delete_outline, color: Colors.red),
            label: Text('DELETE ${isCustomer ? 'CUSTOMER' : 'SUPPLIER'}',
                style: const TextStyle(color: Colors.red, fontWeight: FontWeight.w700)),
            style: OutlinedButton.styleFrom(
                side: const BorderSide(color: Colors.red), minimumSize: const Size.fromHeight(50)),
          ),
        ),
      ]),
    );
  }
}
