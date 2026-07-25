import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../core/api_client.dart';
import '../core/formatters.dart';
import '../core/theme.dart';
import '../l10n/translations.dart';
import '../models/models.dart';
import '../providers/app_state.dart';
import '../widgets/common.dart';

class EntryDetailsScreen extends StatefulWidget {
  final Party party;
  final TxEntry entry;
  const EntryDetailsScreen({super.key, required this.party, required this.entry});

  @override
  State<EntryDetailsScreen> createState() => _EntryDetailsScreenState();
}

class _EntryDetailsScreenState extends State<EntryDetailsScreen> {
  bool deleting = false;

  Future<void> _delete(BuildContext context) async {
    if (deleting) return;
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(context.tr('entryDetails.deleteConfirmTitle')),
        content: Text(context.tr('entryDetails.deleteConfirmBody')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(context.tr('common.cancel'))),
          TextButton(onPressed: () => Navigator.pop(ctx, true),
              child: Text(context.tr('common.delete'), style: const TextStyle(color: Colors.red))),
        ],
      ),
    );
    if (confirm != true || !context.mounted) return;
    setState(() => deleting = true);
    try {
      final app = context.read<AppState>();
      await ApiClient.instance.delete('${app.basePath}/transactions/${entry.id}');
      if (context.mounted) Navigator.pop(context, true);
    } catch (e) {
      if (context.mounted) {
        showSnack(context, e.toString(), error: true);
        setState(() => deleting = false);
      }
    }
  }

  Party get party => widget.party;
  TxEntry get entry => widget.entry;

  @override
  Widget build(BuildContext context) {
    final gave = entry.type == 'GAVE';
    final color = gave ? AppColors.gave : AppColors.got;

    return Scaffold(
      backgroundColor: AppColors.surface,
      appBar: AppBar(title: Text(context.tr('entryDetails.title'))),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: OutlinedButton.icon(
            onPressed: deleting ? null : () => _delete(context),
            icon: const Icon(Icons.delete_outline, color: Colors.red),
            label: Text(context.tr('entryDetails.delete'), style: const TextStyle(color: Colors.red)),
            style: OutlinedButton.styleFrom(
                side: const BorderSide(color: Colors.red),
                minimumSize: const Size.fromHeight(50)),
          ),
        ),
      ),
      body: ListView(padding: const EdgeInsets.all(14), children: [
        Card(
          child: Column(children: [
            ListTile(
              leading: InitialAvatar(party.name),
              title: Text(party.name, style: const TextStyle(fontWeight: FontWeight.w800)),
              subtitle: Text(fmtDateTime(entry.entryDate)),
              trailing: Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                Text(inr(entry.amount),
                    style: TextStyle(color: color, fontSize: 18, fontWeight: FontWeight.w800)),
                Text(gave ? context.tr('entryDetails.credit') : context.tr('entryDetails.payment'), style: const TextStyle(fontSize: 12)),
              ]),
            ),
            const Divider(height: 1),
            ListTile(
              title: Text(context.tr('entryDetails.runningBalance')),
              trailing: Text(inr(entry.runningBalance),
                  style: const TextStyle(color: AppColors.gave, fontSize: 16, fontWeight: FontWeight.w800)),
            ),
            if (entry.description != null && entry.description!.isNotEmpty) ...[
              const Divider(height: 1),
              ListTile(title: Text(context.tr('entryDetails.details')), subtitle: Text(entry.description!)),
            ],
            const Divider(height: 1),
            ListTile(title: Text(context.tr('entryDetails.paymentMode')), trailing: Text(context.tr(modeLabelKeys[entry.paymentMode] ?? entry.paymentMode))),
          ]),
        ),
        const SizedBox(height: 12),
        Card(
          child: ListTile(
            leading: const Icon(Icons.cloud_done_outlined, color: Colors.blueGrey),
            title: Text(context.tr('entryDetails.backedUp')),
          ),
        ),
        const SizedBox(height: 20),
        Center(
          child: Text(context.tr('entryDetails.safeSecure'),
              style: const TextStyle(color: Colors.green, fontWeight: FontWeight.w700)),
        ),
      ]),
    );
  }
}
