import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';
import '../core/api_client.dart';
import '../core/share_message.dart';
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
  bool reminding = false;

  // Composes the reminder message server-side (needs the party's live
  // balance), then lets the user pick WhatsApp or SMS to actually send it —
  // opens the phone's own app with the chat + text pre-filled, user taps
  // send themselves. No backend messaging API involved.
  Future<void> _remind() async {
    if (reminding) return;
    if (party.phone == null || party.phone!.isEmpty) {
      showSnack(context, context.tr('partyProfile.addMobileNumber'), error: true);
      return;
    }
    setState(() => reminding = true);
    try {
      final app = context.read<AppState>();
      final created = await ApiClient.instance.post('${app.basePath}/reminders', {
        'partyId': party.id,
        'dueDate': DateTime.now().toIso8601String(),
      });
      final reminderId = created['data']['id'];
      final sent = await ApiClient.instance.post('${app.basePath}/reminders/$reminderId/send');
      final message = sent['data']['message'] as String;
      final phone = sent['data']['phone'] as String;
      if (!mounted) return;
      await showModalBottomSheet<void>(
        context: context,
        shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
        builder: (ctx) => Padding(
          padding: const EdgeInsets.all(20),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(context.tr('partyProfile.sendReminderVia'), style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(color: const Color(0xFFF5F5F5), borderRadius: BorderRadius.circular(8)),
              child: Text(message, style: const TextStyle(fontSize: 13)),
            ),
            const SizedBox(height: 16),
            Row(children: [
              Expanded(
                child: ElevatedButton.icon(
                  style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF25D366)),
                  onPressed: () { Navigator.pop(ctx); shareViaWhatsApp(phone, message); },
                  icon: const Icon(Icons.chat, color: Colors.white),
                  label: Text(context.tr('partyProfile.sendViaWhatsapp'), style: const TextStyle(color: Colors.white)),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () { Navigator.pop(ctx); shareViaSms(phone, message); },
                  icon: const Icon(Icons.sms_outlined),
                  label: Text(context.tr('partyProfile.sendViaSms')),
                ),
              ),
            ]),
          ]),
        ),
      );
    } catch (e) {
      if (mounted) showSnack(context, e.toString(), error: true);
    } finally {
      if (mounted) setState(() => reminding = false);
    }
  }

  // Shares this business's own contact card (name/phone/address) as plain
  // text via the OS share sheet — no image, just enough for the recipient
  // to save it as a contact or forward it on.
  Future<void> _shareBusinessCard() async {
    final biz = context.read<AppState>().business;
    if (biz == null) return;
    final lines = [
      biz.name,
      if (biz.phone != null && biz.phone!.isNotEmpty) '📞 ${biz.phone}',
      if (biz.address != null && biz.address!.isNotEmpty) biz.address!,
    ];
    await Share.share(lines.join('\n'), subject: biz.name);
  }

  Future<void> _editField(String label, String field, String? current,
      {TextInputType? keyboard, IconData icon = Icons.edit_outlined}) async {
    final ctrl = TextEditingController(text: current ?? '');
    final value = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Row(children: [
          Icon(icon, color: AppColors.primary, size: 20),
          const SizedBox(width: 10),
          Text(context.tr('partyProfile.editLabel', {'label': label})),
        ]),
        content: TextField(
          controller: ctrl,
          autofocus: true,
          keyboardType: keyboard,
          decoration: InputDecoration(hintText: label),
        ),
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

  // ── Shared card/row toolkit (matches the reports screen redesign) ──
  Widget _sectionTitle(IconData icon, String text) => Padding(
        padding: const EdgeInsets.fromLTRB(4, 18, 4, 8),
        child: Row(children: [
          Icon(icon, size: 15, color: AppColors.primary),
          const SizedBox(width: 6),
          Text(text.toUpperCase(),
              style: const TextStyle(fontWeight: FontWeight.w800, color: Colors.black54, fontSize: 12, letterSpacing: 0.4)),
        ]),
      );

  Widget _card(List<Widget> children) => Container(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: const Color(0xFFEEEEEE)),
        ),
        clipBehavior: Clip.antiAlias,
        child: Column(children: children),
      );

  Widget _field({
    required IconData icon,
    required String label,
    required String value,
    required bool isPlaceholder,
    required VoidCallback onTap,
    bool last = false,
  }) =>
      InkWell(
        onTap: onTap,
        child: Container(
          decoration: BoxDecoration(
            border: last ? null : const Border(bottom: BorderSide(color: Color(0xFFEEEEEE))),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
          child: Row(children: [
            Icon(icon, size: 20, color: AppColors.primary),
            const SizedBox(width: 14),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(label,
                    style: const TextStyle(fontSize: 11.5, color: Colors.black45, fontWeight: FontWeight.w700, letterSpacing: 0.2)),
                const SizedBox(height: 3),
                Text(value,
                    style: TextStyle(
                        fontSize: 15.5,
                        color: isPlaceholder ? Colors.black38 : Colors.black87,
                        fontWeight: FontWeight.w600)),
              ]),
            ),
            const Icon(Icons.chevron_right, color: Colors.black26),
          ]),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final isCustomer = party.type == 'CUSTOMER';
    final typeLabel = isCustomer ? context.tr('partyProfile.customer') : context.tr('partyProfile.supplier');
    return Scaffold(
      backgroundColor: AppColors.surface,
      appBar: AppBar(title: Text(isCustomer ? context.tr('partyProfile.customerProfile') : context.tr('partyProfile.supplierProfile'))),
      body: ListView(padding: const EdgeInsets.fromLTRB(14, 0, 14, 16), children: [
        Container(
          margin: const EdgeInsets.only(top: 14),
          width: double.infinity,
          padding: const EdgeInsets.symmetric(vertical: 22),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: const Color(0xFFEEEEEE)),
          ),
          child: Column(children: [
            Stack(alignment: Alignment.bottomRight, children: [
              InitialAvatar(party.name, radius: 46),
              const CircleAvatar(
                radius: 15,
                backgroundColor: AppColors.primary,
                child: Icon(Icons.photo_camera, color: Colors.white, size: 16),
              ),
            ]),
            const SizedBox(height: 10),
            Text(party.name, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
            const SizedBox(height: 2),
            Text(typeLabel, style: const TextStyle(fontSize: 13, color: Colors.black45, fontWeight: FontWeight.w600)),
            const SizedBox(height: 14),
            OutlinedButton.icon(
              onPressed: _shareBusinessCard,
              icon: const Icon(Icons.badge_outlined),
              label: Text(context.tr('partyProfile.shareBusinessCard')),
            ),
          ]),
        ),
        _sectionTitle(Icons.contact_page_outlined, context.tr('partyProfile.contactDetails')),
        _card([
          _field(
            icon: Icons.person_outline,
            label: context.tr('partyProfile.name'),
            value: party.name,
            isPlaceholder: false,
            onTap: () => _editField(context.tr('partyProfile.name'), 'name', party.name, icon: Icons.person_outline),
          ),
          _field(
            icon: Icons.call_outlined,
            label: context.tr('partyProfile.mobileNumber'),
            value: party.phone ?? context.tr('partyProfile.addMobileNumber'),
            isPlaceholder: party.phone == null || party.phone!.isEmpty,
            onTap: () => _editField(context.tr('partyProfile.mobileNumber'), 'phone', party.phone,
                keyboard: TextInputType.phone, icon: Icons.call_outlined),
          ),
          _field(
            icon: Icons.location_on_outlined,
            label: context.tr('partyProfile.address'),
            value: party.address.isEmpty ? context.tr('partyProfile.addAddress') : party.address,
            isPlaceholder: party.address.isEmpty,
            onTap: () => _editField(context.tr('partyProfile.address'), 'addressLine', party.addressLine,
                icon: Icons.location_on_outlined),
          ),
          _field(
            icon: Icons.description_outlined,
            label: context.tr('partyProfile.gstin'),
            value: party.gstin?.isNotEmpty == true ? party.gstin! : context.tr('partyProfile.addGstin'),
            isPlaceholder: party.gstin == null || party.gstin!.isEmpty,
            last: true,
            onTap: () => _editField(context.tr('partyProfile.gstin'), 'gstin', party.gstin, icon: Icons.description_outlined),
          ),
        ]),
        const SizedBox(height: 20),
        OutlinedButton.icon(
          onPressed: reminding ? null : _remind,
          icon: reminding
              ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
              : const Icon(Icons.notifications_active_outlined),
          label: Text(context.tr('partyProfile.remind')),
          style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(50)),
        ),
        const SizedBox(height: 12),
        OutlinedButton.icon(
          onPressed: deleting ? null : _delete,
          icon: const Icon(Icons.delete_outline, color: Colors.red),
          label: Text(context.tr('partyProfile.deleteType', {'type': typeLabel.toUpperCase()}),
              style: const TextStyle(color: Colors.red, fontWeight: FontWeight.w700)),
          style: OutlinedButton.styleFrom(
              side: const BorderSide(color: Colors.red), minimumSize: const Size.fromHeight(50)),
        ),
      ]),
    );
  }
}
