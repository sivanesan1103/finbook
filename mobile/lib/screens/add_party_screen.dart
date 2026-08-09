import 'package:flutter/material.dart';
import 'package:flutter_contacts/flutter_contacts.dart';
import 'package:provider/provider.dart';
import '../core/api_client.dart';
import '../l10n/translations.dart';
import '../providers/app_state.dart';
import '../widgets/common.dart';

class AddPartyScreen extends StatefulWidget {
  final String initialType;
  const AddPartyScreen({super.key, this.initialType = 'CUSTOMER'});

  @override
  State<AddPartyScreen> createState() => _AddPartyScreenState();
}

class _AddPartyScreenState extends State<AddPartyScreen> {
  final name = TextEditingController();
  final phone = TextEditingController();
  final gstin = TextEditingController();
  final flat = TextEditingController();
  final area = TextEditingController();
  final pincode = TextEditingController();
  final city = TextEditingController();
  final state = TextEditingController();
  late String type = widget.initialType;
  bool showGst = false;
  bool sameShipping = true;
  bool busy = false;

  /// Strips country code / trunk prefix so only the 10-digit local number
  /// remains, matching the fixed "+91" prefix shown next to the field.
  String _cleanIndianMobile(String raw) {
    final digits = raw.replaceAll(RegExp(r'[^\d+]'), '');
    if (digits.startsWith('+91')) return digits.substring(3);
    if (digits.startsWith('91') && digits.length == 12) return digits.substring(2);
    if (digits.startsWith('+')) return digits.substring(1);
    // Domestic numbers are sometimes saved with a leading trunk "0" (e.g. "09876543210").
    if (digits.startsWith('0') && digits.length == 11) return digits.substring(1);
    return digits;
  }

  Future<void> _pickContact() async {
    final granted = await FlutterContacts.requestPermission(readonly: true);
    if (!granted) {
      if (mounted) showSnack(context, context.tr('addParty.contactsPermissionDenied'), error: true);
      return;
    }
    final contact = await FlutterContacts.openExternalPick();
    if (contact == null || !mounted) return;
    if (contact.phones.isEmpty) {
      showSnack(context, context.tr('addParty.contactHasNoPhone'), error: true);
      return;
    }
    final chosen = contact.phones.firstWhere(
      (p) => p.label == PhoneLabel.mobile,
      orElse: () => contact.phones.first,
    );
    final source = chosen.normalizedNumber.isNotEmpty ? chosen.normalizedNumber : chosen.number;
    final cleaned = _cleanIndianMobile(source);
    setState(() {
      phone.text = cleaned;
      if (name.text.trim().isEmpty && contact.displayName.trim().isNotEmpty) {
        name.text = contact.displayName;
      }
    });
  }

  Future<void> _save() async {
    // The button disables on rebuild after setState, but a fast double-tap
    // can fire both pointer-up events before that rebuild lands — guard
    // re-entrancy explicitly instead of relying on the disabled state alone
    // (same race add_entry_screen.dart already guards against).
    if (busy) return;
    setState(() => busy = true);
    try {
      final app = context.read<AppState>();
      await ApiClient.instance.post('${app.basePath}/parties', {
        'type': type,
        'name': name.text.trim(),
        if (phone.text.trim().isNotEmpty) 'phone': phone.text.trim(),
        if (gstin.text.trim().isNotEmpty) 'gstin': gstin.text.trim(),
        if (flat.text.trim().isNotEmpty) 'addressLine': flat.text.trim(),
        if (area.text.trim().isNotEmpty) 'area': area.text.trim(),
        if (city.text.trim().isNotEmpty) 'city': city.text.trim(),
        if (state.text.trim().isNotEmpty) 'state': state.text.trim(),
        if (pincode.text.trim().isNotEmpty) 'pincode': pincode.text.trim(),
      });
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) showSnack(context, e.toString(), error: true);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isCustomer = type == 'CUSTOMER';
    return Scaffold(
      appBar: AppBar(title: Text(context.tr('addParty.title'))),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: ElevatedButton(
            onPressed: busy || name.text.trim().isEmpty ? null : _save,
            child: Text(busy ? context.tr('addParty.saving') : isCustomer ? context.tr('addParty.addCustomer') : context.tr('addParty.addSupplier')),
          ),
        ),
      ),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        TextField(
          controller: name,
          autofocus: true,
          onChanged: (_) => setState(() {}),
          decoration: InputDecoration(labelText: context.tr('addParty.partyNameRequired')),
        ),
        const SizedBox(height: 14),
        Row(children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 15),
            decoration: BoxDecoration(
              border: Border.all(color: Colors.blueGrey.shade100),
              borderRadius: BorderRadius.circular(10),
              color: Colors.white,
            ),
            child: const Text('🇮🇳 +91'),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: TextField(
              controller: phone,
              keyboardType: TextInputType.phone,
              decoration: InputDecoration(
                labelText: context.tr('addParty.mobileNumber'),
                suffixIcon: IconButton(
                  icon: const Icon(Icons.contact_phone_outlined),
                  tooltip: context.tr('addParty.pickFromContacts'),
                  onPressed: _pickContact,
                ),
              ),
            ),
          ),
        ]),
        const SizedBox(height: 16),
        Text(context.tr('addParty.whoAreThey'), style: const TextStyle(fontWeight: FontWeight.w600)),
        Row(children: [
          Expanded(
            child: RadioListTile<String>(
              dense: true, value: 'CUSTOMER', groupValue: type,
              title: Text(context.tr('addParty.customer')),
              onChanged: (v) => setState(() => type = v!),
            ),
          ),
          Expanded(
            child: RadioListTile<String>(
              dense: true, value: 'SUPPLIER', groupValue: type,
              title: Text(context.tr('addParty.supplier')),
              onChanged: (v) => setState(() => type = v!),
            ),
          ),
        ]),
        TextButton.icon(
          onPressed: () => setState(() => showGst = !showGst),
          icon: Icon(showGst ? Icons.remove : Icons.add),
          label: Text(context.tr('addParty.addGstinAddress')),
        ),
        if (showGst) ...[
          TextField(controller: gstin, decoration: InputDecoration(labelText: context.tr('addParty.gstin'))),
          const SizedBox(height: 12),
          Text(context.tr('addParty.billingAddress'), style: const TextStyle(fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          TextField(controller: flat, decoration: InputDecoration(labelText: context.tr('addParty.flatBuilding'))),
          const SizedBox(height: 10),
          TextField(controller: area, decoration: InputDecoration(labelText: context.tr('addParty.areaLocality'))),
          const SizedBox(height: 10),
          TextField(controller: pincode, keyboardType: TextInputType.number,
              decoration: InputDecoration(labelText: context.tr('addParty.pincode'))),
          const SizedBox(height: 10),
          Row(children: [
            Expanded(child: TextField(controller: city, decoration: InputDecoration(labelText: context.tr('addParty.city')))),
            const SizedBox(width: 10),
            Expanded(child: TextField(controller: state, decoration: InputDecoration(labelText: context.tr('addParty.state')))),
          ]),
          CheckboxListTile(
            value: sameShipping,
            onChanged: (v) => setState(() => sameShipping = v ?? true),
            title: Text(context.tr('addParty.shippingSameAsBilling')),
            controlAffinity: ListTileControlAffinity.leading,
            contentPadding: EdgeInsets.zero,
          ),
        ],
      ]),
    );
  }
}
