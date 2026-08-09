import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../core/api_client.dart';
import '../core/theme.dart';
import '../l10n/translations.dart';
import '../models/models.dart';
import '../providers/app_state.dart';
import '../widgets/common.dart';

class AddEntryScreen extends StatefulWidget {
  final Party party;
  final String type; // GAVE | GOT
  final TxEntry? entry; // non-null when editing an existing entry
  const AddEntryScreen({super.key, required this.party, required this.type, this.entry});

  @override
  State<AddEntryScreen> createState() => _AddEntryScreenState();
}

class _AddEntryScreenState extends State<AddEntryScreen> {
  final amount = TextEditingController();
  final details = TextEditingController();
  String paymentMode = 'CASH';
  DateTime entryDate = DateTime.now();
  bool busy = false;

  bool get editing => widget.entry != null;
  bool get gave => widget.type == 'GAVE';
  Color get color => gave ? AppColors.gave : AppColors.got;

  static String _trimNum(double n) => n == n.roundToDouble() ? n.toInt().toString() : n.toString();

  @override
  void initState() {
    super.initState();
    final e = widget.entry;
    if (e != null) {
      amount.text = _trimNum(e.amount);
      details.text = e.description ?? '';
      paymentMode = e.paymentMode;
      entryDate = e.entryDate;
    }
  }

  Future<void> _save() async {
    // The button disables on rebuild after setState, but a fast double-tap
    // can fire both pointer-up events before that rebuild lands — guard
    // re-entrancy explicitly instead of relying on the disabled state alone.
    if (busy) return;
    setState(() => busy = true);
    try {
      final app = context.read<AppState>();
      final body = {
        'type': widget.type,
        'amount': double.parse(amount.text),
        if (details.text.trim().isNotEmpty) 'description': details.text.trim(),
        'paymentMode': paymentMode,
        // .toUtc() first, same reasoning as cashbook_screen.dart — a bare
        // local-time string gets misread as UTC server-side, shifting the
        // recorded time by the device's UTC offset (5.5h for IST).
        'entryDate': entryDate.toUtc().toIso8601String(),
      };
      if (editing) {
        await ApiClient.instance.patch('${app.basePath}/transactions/${widget.entry!.id}', body);
      } else {
        await ApiClient.instance.post('${app.basePath}/parties/${widget.party.id}/transactions', body);
      }
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) showSnack(context, e.toString(), error: true);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: color,
        title: Text(
            editing
                ? context.tr('addEntry.editTitle')
                : gave
                    ? context.tr('addEntry.youGaveTo', {'name': widget.party.name})
                    : context.tr('addEntry.youGotFrom', {'name': widget.party.name}),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: color),
            onPressed: busy || amount.text.isEmpty || double.tryParse(amount.text) == null
                ? null
                : _save,
            child: Text(busy
                ? context.tr('addEntry.saving')
                : editing
                    ? context.tr('addEntry.saveChanges')
                    : context.tr('addEntry.save')),
          ),
        ),
      ),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        TextField(
          controller: amount,
          autofocus: true,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          onChanged: (_) => setState(() {}),
          style: TextStyle(fontSize: 28, fontWeight: FontWeight.w800, color: color),
          decoration: InputDecoration(prefixText: '₹ ', labelText: context.tr('addEntry.enterAmount')),
        ),
        const SizedBox(height: 14),
        TextField(
          controller: details,
          decoration: InputDecoration(
            labelText: context.tr('addEntry.enterDetails'),
            prefixIcon: const Icon(Icons.notes),
          ),
        ),
        const SizedBox(height: 14),
        DropdownButtonFormField<String>(
          value: paymentMode,
          decoration: InputDecoration(labelText: context.tr('addEntry.paymentMode'), prefixIcon: const Icon(Icons.payments_outlined)),
          items: ['CASH', 'ONLINE', 'UPI', 'BANK', 'CHEQUE']
              .map((m) => DropdownMenuItem(value: m, child: Text(context.tr(modeLabelKeys[m]!))))
              .toList(),
          onChanged: (v) => setState(() => paymentMode = v!),
        ),
        const SizedBox(height: 14),
        ListTile(
          shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(10),
              side: BorderSide(color: Colors.blueGrey.shade100)),
          tileColor: Colors.white,
          leading: const Icon(Icons.calendar_month, color: AppColors.primary),
          title: Text('${entryDate.day}/${entryDate.month}/${entryDate.year}'),
          onTap: () async {
            final picked = await showDatePicker(
              context: context,
              initialDate: entryDate,
              firstDate: DateTime(2020),
              lastDate: DateTime.now(),
            );
            if (picked != null) setState(() => entryDate = picked);
          },
        ),
      ]),
    );
  }
}
