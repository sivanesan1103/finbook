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
import '../core/share_message.dart';
import '../core/theme.dart';
import '../l10n/translations.dart';
import '../models/models.dart';
import '../providers/app_state.dart';
import '../widgets/common.dart';
import 'add_entry_screen.dart';

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
  bool sendingWhatsapp = false;
  final GlobalKey _cardKey = GlobalKey();

  // Caption is composed server-side (Khatabook-style, with a public "view
  // transaction history" link) so it comes back in the sender's own app
  // language. Falls back to a local caption if the share-link endpoint is
  // unreachable — still shareable, just without the link.
  Future<String> _composeText(BuildContext context) async {
    final app = context.read<AppState>();
    try {
      final res = await ApiClient.instance.get('${app.basePath}/transactions/${entry.id}/share');
      return res['data']['message'] as String;
    } catch (_) {
      final gave = entry.type == 'GAVE';
      final label = gave ? context.tr('entryDetails.credit') : context.tr('entryDetails.payment');
      return '${party.name} — $label ${inr(entry.amount)} • ${fmtDateTime(entry.entryDate)}\n'
          '${context.tr('entryDetails.runningBalance')}: ${inr(entry.runningBalance)}';
    }
  }

  // Renders the entry card to a PNG and hands it to the OS share sheet —
  // the user picks WhatsApp/SMS/whatever themselves, same as a screenshot
  // but cropped to just the card and without the status bar. Since WhatsApp
  // has no way to open a specific chat with a file pre-attached, this always
  // lands on WhatsApp's own chat picker when WhatsApp is chosen — that's a
  // platform limitation, not something fixable here. Use "Send via
  // WhatsApp" instead for a direct-to-chat share (text only, no image).
  // Image only, no caption/link — kept intentionally so the shared media
  // is just the card screenshot.
  Future<void> _share(BuildContext context) async {
    if (sharing) return;
    setState(() => sharing = true);
    try {
      final boundary = _cardKey.currentContext!.findRenderObject() as RenderRepaintBoundary;
      final image = await boundary.toImage(pixelRatio: 3);
      final byteData = await image.toByteData(format: ui.ImageByteFormat.png);
      final Uint8List bytes = byteData!.buffer.asUint8List();
      final dir = await getTemporaryDirectory();
      final file = File('${dir.path}/entry_${entry.id}.png');
      await file.writeAsBytes(bytes, flush: true);
      if (!context.mounted) return;
      await Share.shareXFiles([XFile(file.path)]);
    } catch (e) {
      if (context.mounted) showSnack(context, 'Could not share: $e', error: true);
    } finally {
      if (mounted) setState(() => sharing = false);
    }
  }

  // Opens the party's exact WhatsApp chat via the wa.me deep link — text
  // only (no image), same mechanism as the reminder flow — instead of
  // routing through the OS share sheet's chat picker.
  Future<void> _sendViaWhatsapp(BuildContext context) async {
    if (sendingWhatsapp) return;
    if (party.phone == null || party.phone!.isEmpty) {
      showSnack(context, context.tr('partyProfile.addMobileNumber'), error: true);
      return;
    }
    setState(() => sendingWhatsapp = true);
    try {
      final text = await _composeText(context);
      if (!context.mounted) return;
      await shareViaWhatsApp(party.phone!, text);
    } catch (e) {
      if (context.mounted) showSnack(context, 'Could not share: $e', error: true);
    } finally {
      if (mounted) setState(() => sendingWhatsapp = false);
    }
  }

  Future<void> _edit(BuildContext context) async {
    final saved = await Navigator.push<bool>(
      context,
      MaterialPageRoute(builder: (_) => AddEntryScreen(party: party, type: entry.type, entry: entry)),
    );
    // Editing can change the amount/date, which shifts every running balance
    // after it — simplest correct fix is to pop back to the ledger (like
    // delete already does) so it reloads with fresh totals, rather than
    // patching this screen's now-stale entry in place.
    if (saved == true && context.mounted) Navigator.pop(context, true);
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
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Row(children: [
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
                child: ElevatedButton.icon(
                  onPressed: sendingWhatsapp ? null : () => _sendViaWhatsapp(context),
                  style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF25D366), minimumSize: const Size.fromHeight(50)),
                  icon: sendingWhatsapp
                      ? const SizedBox(
                          width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                      : const Icon(Icons.chat, color: Colors.white),
                  label: Text(context.tr('entryDetails.sendViaWhatsapp'), style: const TextStyle(color: Colors.white)),
                ),
              ),
            ]),
            const SizedBox(height: 12),
            Row(children: [
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
            const Divider(height: 1),
            InkWell(
              onTap: () => _edit(context),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 12),
                child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                  const Icon(Icons.edit_outlined, size: 18, color: AppColors.primary),
                  const SizedBox(width: 8),
                  Text(context.tr('entryDetails.editEntry'),
                      style: const TextStyle(color: AppColors.primary, fontWeight: FontWeight.w700)),
                ]),
              ),
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
