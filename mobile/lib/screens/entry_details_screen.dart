import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../core/api_client.dart';
import '../core/formatters.dart';
import '../core/theme.dart';
import '../models/models.dart';
import '../providers/app_state.dart';
import '../widgets/common.dart';

class EntryDetailsScreen extends StatelessWidget {
  final Party party;
  final TxEntry entry;
  const EntryDetailsScreen({super.key, required this.party, required this.entry});

  Future<void> _delete(BuildContext context) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete entry?'),
        content: const Text('This entry will be removed from the khata (recoverable from the database).'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Delete', style: TextStyle(color: Colors.red))),
        ],
      ),
    );
    if (confirm != true || !context.mounted) return;
    try {
      final app = context.read<AppState>();
      await ApiClient.instance.delete('${app.basePath}/transactions/${entry.id}');
      if (context.mounted) Navigator.pop(context, true);
    } catch (e) {
      if (context.mounted) showSnack(context, e.toString(), error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final gave = entry.type == 'GAVE';
    final color = gave ? AppColors.gave : AppColors.got;

    return Scaffold(
      backgroundColor: AppColors.surface,
      appBar: AppBar(title: const Text('Entry Details')),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(children: [
            Expanded(
              child: OutlinedButton.icon(
                onPressed: () => _delete(context),
                icon: const Icon(Icons.delete_outline, color: Colors.red),
                label: const Text('DELETE', style: TextStyle(color: Colors.red)),
                style: OutlinedButton.styleFrom(
                    side: const BorderSide(color: Colors.red),
                    minimumSize: const Size.fromHeight(50)),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: ElevatedButton.icon(
                onPressed: () => showSnack(context, 'Share via SMS/WhatsApp gateway — see backend sms.js'),
                icon: const Icon(Icons.share),
                label: const Text('SHARE'),
              ),
            ),
          ]),
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
                Text(gave ? 'Credit' : 'Payment', style: const TextStyle(fontSize: 12)),
              ]),
            ),
            const Divider(height: 1),
            ListTile(
              title: const Text('Running Balance'),
              trailing: Text(inr(entry.runningBalance),
                  style: const TextStyle(color: AppColors.gave, fontSize: 16, fontWeight: FontWeight.w800)),
            ),
            if (entry.description != null && entry.description!.isNotEmpty) ...[
              const Divider(height: 1),
              ListTile(title: const Text('Details'), subtitle: Text(entry.description!)),
            ],
            const Divider(height: 1),
            ListTile(title: const Text('Payment Mode'), trailing: Text(entry.paymentMode)),
          ]),
        ),
        const SizedBox(height: 12),
        Card(
          child: ListTile(
            leading: Icon(entry.smsSent ? Icons.sms : Icons.sms_failed_outlined,
                color: entry.smsSent ? Colors.green : Colors.grey),
            title: Text(entry.smsSent ? 'SMS sent' : 'SMS disabled'),
            subtitle: Text(entry.smsSent
                ? 'The party was notified about this entry.'
                : 'Enable SMS in the party profile to notify on each entry.'),
          ),
        ),
        const SizedBox(height: 12),
        const Card(
          child: ListTile(
            leading: Icon(Icons.cloud_done_outlined, color: Colors.blueGrey),
            title: Text('Entry is backed up'),
          ),
        ),
        const SizedBox(height: 20),
        const Center(
          child: Text('✅ 100% Safe and Secure',
              style: TextStyle(color: Colors.green, fontWeight: FontWeight.w700)),
        ),
      ]),
    );
  }
}
