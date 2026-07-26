import 'dart:io';
import 'dart:typed_data';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:path_provider/path_provider.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';
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
  bool sharing = false;
  final GlobalKey _cardKey = GlobalKey();

  // Renders the entry card to a PNG and hands it to the OS share sheet —
  // the user picks WhatsApp/SMS/whatever themselves, same as a screenshot
  // but cropped to just the card and without the status bar.
  Future<void> _share(BuildContext context) async {
    if (sharing) return;
    setState(() => sharing = true);
    try {
      final gave = entry.type == 'GAVE';
      final label = gave ? context.tr('entryDetails.credit') : context.tr('entryDetails.payment');
      final text = '${party.name} — $label ${inr(entry.amount)} • ${fmtDateTime(entry.entryDate)}\n'
          '${context.tr('entryDetails.runningBalance')}: ${inr(entry.runningBalance)}';
      final boundary = _cardKey.currentContext!.findRenderObject() as RenderRepaintBoundary;
      final image = await boundary.toImage(pixelRatio: 3);
      final byteData = await image.toByteData(format: ui.ImageByteFormat.png);
      final Uint8List bytes = byteData!.buffer.asUint8List();
      final dir = await getTemporaryDirectory();
      final file = File('${dir.path}/entry_${entry.id}.png');
      await file.writeAsBytes(bytes, flush: true);
      if (!context.mounted) return;
      await Share.shareXFiles([XFile(file.path)], text: text);
    } catch (e) {
      if (context.mounted) showSnack(context, 'Could not share: $e', error: true);
    } finally {
      if (mounted) setState(() => sharing = false);
    }
  }

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
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
          child: Row(children: [
            Expanded(
              child: OutlinedButton.icon(
                onPressed: sharing ? null : () => _share(context),
                icon: sharing
                    ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Icon(Icons.share_outlined),
                label: Text(context.tr('entryDetails.share')),
                style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(50)),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: OutlinedButton.icon(
                onPressed: deleting ? null : () => _delete(context),
                icon: const Icon(Icons.delete_outline, color: Colors.red),
                label: Text(context.tr('entryDetails.delete'), style: const TextStyle(color: Colors.red)),
                style: OutlinedButton.styleFrom(
                    side: const BorderSide(color: Colors.red),
                    minimumSize: const Size.fromHeight(50)),
              ),
            ),
          ]),
        ),
      ),
      body: ListView(padding: const EdgeInsets.all(14), children: [
        RepaintBoundary(
          key: _cardKey,
          child: Card(
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
