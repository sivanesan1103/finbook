import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../core/api_client.dart';
import '../core/theme.dart';
import '../models/models.dart';
import '../providers/app_state.dart';
import '../widgets/common.dart';

class AddEntryScreen extends StatefulWidget {
  final Party party;
  final String type; // GAVE | GOT
  const AddEntryScreen({super.key, required this.party, required this.type});

  @override
  State<AddEntryScreen> createState() => _AddEntryScreenState();
}

class _AddEntryScreenState extends State<AddEntryScreen> {
  final amount = TextEditingController();
  final details = TextEditingController();
  String paymentMode = 'CASH';
  DateTime entryDate = DateTime.now();
  bool busy = false;

  bool get gave => widget.type == 'GAVE';
  Color get color => gave ? AppColors.gave : AppColors.got;

  Future<void> _save() async {
    setState(() => busy = true);
    try {
      final app = context.read<AppState>();
      await ApiClient.instance.post(
        '${app.basePath}/parties/${widget.party.id}/transactions',
        {
          'type': widget.type,
          'amount': double.parse(amount.text),
          if (details.text.trim().isNotEmpty) 'description': details.text.trim(),
          'paymentMode': paymentMode,
          'entryDate': entryDate.toIso8601String(),
        },
      );
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
        title: Text(gave ? 'You gave ₹ to ${widget.party.name}' : 'You got ₹ from ${widget.party.name}',
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
            child: Text(busy ? 'SAVING…' : 'SAVE'),
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
          decoration: const InputDecoration(prefixText: '₹ ', labelText: 'Enter amount'),
        ),
        const SizedBox(height: 14),
        TextField(
          controller: details,
          decoration: const InputDecoration(
            labelText: 'Enter details (items, bill number…)',
            prefixIcon: Icon(Icons.notes),
          ),
        ),
        const SizedBox(height: 14),
        DropdownButtonFormField<String>(
          value: paymentMode,
          decoration: const InputDecoration(labelText: 'Payment mode', prefixIcon: Icon(Icons.payments_outlined)),
          items: const ['CASH', 'ONLINE', 'UPI', 'BANK', 'CHEQUE']
              .map((m) => DropdownMenuItem(value: m, child: Text(m)))
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
