import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../core/api_client.dart';
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

  Future<void> _save() async {
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
      appBar: AppBar(title: const Text('Add Party')),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: ElevatedButton(
            onPressed: busy || name.text.trim().isEmpty ? null : _save,
            child: Text(busy ? 'SAVING…' : isCustomer ? 'ADD CUSTOMER' : 'ADD SUPPLIER'),
          ),
        ),
      ),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        TextField(
          controller: name,
          autofocus: true,
          onChanged: (_) => setState(() {}),
          decoration: const InputDecoration(labelText: 'Party name *'),
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
              decoration: const InputDecoration(labelText: 'Mobile Number'),
            ),
          ),
        ]),
        const SizedBox(height: 16),
        const Text('Who are they?', style: TextStyle(fontWeight: FontWeight.w600)),
        Row(children: [
          Expanded(
            child: RadioListTile<String>(
              dense: true, value: 'CUSTOMER', groupValue: type,
              title: const Text('Customer'),
              onChanged: (v) => setState(() => type = v!),
            ),
          ),
          Expanded(
            child: RadioListTile<String>(
              dense: true, value: 'SUPPLIER', groupValue: type,
              title: const Text('Supplier'),
              onChanged: (v) => setState(() => type = v!),
            ),
          ),
        ]),
        TextButton.icon(
          onPressed: () => setState(() => showGst = !showGst),
          icon: Icon(showGst ? Icons.remove : Icons.add),
          label: const Text('ADD GSTIN & ADDRESS (OPTIONAL)'),
        ),
        if (showGst) ...[
          TextField(controller: gstin, decoration: const InputDecoration(labelText: 'GSTIN')),
          const SizedBox(height: 12),
          const Text('Billing address', style: TextStyle(fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          TextField(controller: flat, decoration: const InputDecoration(labelText: 'Flat / Building Number')),
          const SizedBox(height: 10),
          TextField(controller: area, decoration: const InputDecoration(labelText: 'Area / Locality')),
          const SizedBox(height: 10),
          TextField(controller: pincode, keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: 'Pincode')),
          const SizedBox(height: 10),
          Row(children: [
            Expanded(child: TextField(controller: city, decoration: const InputDecoration(labelText: 'City'))),
            const SizedBox(width: 10),
            Expanded(child: TextField(controller: state, decoration: const InputDecoration(labelText: 'State'))),
          ]),
          CheckboxListTile(
            value: sameShipping,
            onChanged: (v) => setState(() => sameShipping = v ?? true),
            title: const Text('Shipping address same as billing address?'),
            controlAffinity: ListTileControlAffinity.leading,
            contentPadding: EdgeInsets.zero,
          ),
        ],
      ]),
    );
  }
}
