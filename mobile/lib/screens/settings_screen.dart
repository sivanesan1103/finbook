import 'dart:convert';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../core/api_client.dart';
import '../core/file_share.dart';
import '../core/theme.dart';
import '../l10n/translations.dart';
import '../providers/app_state.dart';
import '../providers/locale_provider.dart';
import '../widgets/common.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});
  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  final name = TextEditingController();
  final phone = TextEditingController();
  final gstin = TextEditingController();
  final category = TextEditingController();
  final address = TextEditingController();

  final upiId = TextEditingController();
  final bankName = TextEditingController();
  final bankAccountName = TextEditingController();
  final bankAccountNo = TextEditingController();
  final bankIfsc = TextEditingController();
  final invoiceTerms = TextEditingController();

  bool importing = false;
  String? importResult;

  @override
  void initState() {
    super.initState();
    final b = context.read<AppState>().business;
    if (b != null) {
      name.text = b.name;
      phone.text = b.phone ?? '';
      gstin.text = b.gstin ?? '';
      category.text = b.category ?? '';
      address.text = b.address ?? '';
      upiId.text = b.upiId ?? '';
      bankName.text = b.bankName ?? '';
      bankAccountName.text = b.bankAccountName ?? '';
      bankAccountNo.text = b.bankAccountNo ?? '';
      bankIfsc.text = b.bankIfsc ?? '';
      invoiceTerms.text = b.invoiceTerms ?? '';
    }
  }

  Future<void> _saveBusiness() async {
    final app = context.read<AppState>();
    try {
      await ApiClient.instance.patch('/businesses/${app.business!.id}', {
        'name': name.text.trim(),
        if (phone.text.trim().isNotEmpty) 'phone': phone.text.trim(),
        if (gstin.text.trim().isNotEmpty) 'gstin': gstin.text.trim(),
        if (category.text.trim().isNotEmpty) 'category': category.text.trim(),
        if (address.text.trim().isNotEmpty) 'address': address.text.trim(),
      });
      await app.loadBusinesses();
      if (mounted) showSnack(context, context.tr('settings.savedBusinessSettings'));
    } catch (e) {
      if (mounted) showSnack(context, e.toString(), error: true);
    }
  }

  Future<void> _saveInvoiceDetails() async {
    final app = context.read<AppState>();
    try {
      await ApiClient.instance.patch('/businesses/${app.business!.id}', {
        'upiId': upiId.text.trim().isEmpty ? null : upiId.text.trim(),
        'bankName': bankName.text.trim().isEmpty ? null : bankName.text.trim(),
        'bankAccountName': bankAccountName.text.trim().isEmpty ? null : bankAccountName.text.trim(),
        'bankAccountNo': bankAccountNo.text.trim().isEmpty ? null : bankAccountNo.text.trim(),
        'bankIfsc': bankIfsc.text.trim().isEmpty ? null : bankIfsc.text.trim(),
        'invoiceTerms': invoiceTerms.text.trim().isEmpty ? null : invoiceTerms.text.trim(),
      });
      await app.loadBusinesses();
      if (mounted) showSnack(context, context.tr('settings.savedInvoiceDetails'));
    } catch (e) {
      if (mounted) showSnack(context, e.toString(), error: true);
    }
  }

  Future<void> _exportData() async {
    final app = context.read<AppState>();
    final stamp = DateTime.now().toIso8601String().substring(0, 10);
    await downloadAndShare(context,
        path: '${app.basePath}/export',
        filename: 'finbook-backup-$stamp.json',
        subject: 'FinBook backup — ${app.business?.name}');
  }

  Future<void> _importData() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom, allowedExtensions: ['json'], withData: true,
    );
    final bytes = result?.files.single.bytes;
    if (bytes == null || !mounted) return;

    Map<String, dynamic> parsed;
    try {
      parsed = jsonDecode(utf8.decode(bytes)) as Map<String, dynamic>;
    } catch (_) {
      if (mounted) showSnack(context, context.tr('settings.invalidBackupFile'), error: true);
      return;
    }

    final app = context.read<AppState>();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(context.tr('settings.confirmRestoreTitle')),
        content: Text(context.tr('settings.confirmRestoreBody', {'business': app.business?.name ?? ''})),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(context.tr('common.cancel'))),
          ElevatedButton(onPressed: () => Navigator.pop(ctx, true), child: Text(context.tr('settings.restore'))),
        ],
      ),
    );
    if (ok != true || !mounted) return;

    setState(() { importing = true; importResult = null; });
    try {
      final res = await ApiClient.instance.post('${app.basePath}/import', parsed);
      final s = res['data'];
      setState(() => importResult = context.tr('settings.restoreSummary', {
            'partiesCreated': s['parties']['created'],
            'partiesReused': s['parties']['reused'],
            'txCreated': s['transactions']['created'],
            'cashbookCreated': s['cashbookEntries']['created'],
            'expensesCreated': s['expenses']['created'],
            'itemsCreated': s['items']['created'],
            'invoicesCreated': s['invoices']['created'],
            'invoicesSkipped': s['invoices']['skipped'] > 0
                ? context.tr('settings.restoreSummarySkipped', {'count': s['invoices']['skipped']})
                : '',
          }));
      await app.loadBusinesses();
      if (mounted) showSnack(context, context.tr('settings.backupRestored'));
    } catch (e) {
      if (mounted) showSnack(context, e.toString(), error: true);
    } finally {
      if (mounted) setState(() => importing = false);
    }
  }

  Widget _card(String title, List<Widget> children, {String? subtitle}) => Container(
        margin: const EdgeInsets.fromLTRB(14, 10, 14, 0),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
          if (subtitle != null) ...[
            const SizedBox(height: 2),
            Text(subtitle, style: const TextStyle(fontSize: 12, color: Colors.black45)),
          ],
          const SizedBox(height: 12),
          ...children,
        ]),
      );

  Widget _field(TextEditingController c, String label, {int maxLines = 1, TextInputType? type}) => Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: TextField(controller: c, maxLines: maxLines, keyboardType: type,
            decoration: InputDecoration(labelText: label)),
      );

  @override
  Widget build(BuildContext context) {
    final locale = context.watch<LocaleProvider>();
    return Scaffold(
      backgroundColor: AppColors.surface,
      appBar: AppBar(title: Text(context.tr('settings.title'))),
      body: ListView(padding: const EdgeInsets.only(bottom: 24), children: [
        _card(context.tr('settings.bookSettingsTitle'), [
          _field(name, context.tr('settings.businessName')),
          _field(phone, context.tr('settings.phone'), type: TextInputType.phone),
          _field(gstin, context.tr('settings.gstin')),
          _field(category, context.tr('settings.category')),
          _field(address, context.tr('settings.address'), maxLines: 2),
          ElevatedButton(onPressed: _saveBusiness, child: Text(context.tr('settings.saveBusinessSettings'))),
        ]),
        _card(context.tr('settings.invoicePaymentTitle'), [
          _field(upiId, context.tr('settings.upiId')),
          _field(bankName, context.tr('settings.bankName')),
          _field(bankAccountName, context.tr('settings.bankAccountName')),
          _field(bankAccountNo, context.tr('settings.bankAccountNo')),
          _field(bankIfsc, context.tr('settings.bankIfsc')),
          _field(invoiceTerms, context.tr('settings.invoiceTerms'), maxLines: 3),
          ElevatedButton(onPressed: _saveInvoiceDetails, child: Text(context.tr('settings.saveInvoiceDetails'))),
        ], subtitle: context.tr('settings.invoicePaymentSubtitle')),
        _card(context.tr('settings.backupTitle'), [
          Row(children: [
            Expanded(
              child: ElevatedButton.icon(
                onPressed: _exportData,
                icon: const Icon(Icons.download),
                label: Text(context.tr('settings.export')),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: OutlinedButton.icon(
                onPressed: importing ? null : _importData,
                icon: importing
                    ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Icon(Icons.upload),
                label: Text(context.tr('settings.restore')),
              ),
            ),
          ]),
          if (importResult != null) ...[
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(color: const Color(0xFFEFF7F0), borderRadius: BorderRadius.circular(8)),
              child: Text(importResult!, style: const TextStyle(fontSize: 12, color: AppColors.got)),
            ),
          ],
          const SizedBox(height: 10),
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(color: const Color(0xFFFFF6E0), borderRadius: BorderRadius.circular(8)),
            child: Text(
              context.tr('settings.restoreWarning'),
              style: const TextStyle(fontSize: 11),
            ),
          ),
        ], subtitle: context.tr('settings.backupSubtitle')),
        _card(context.tr('settings.languageTitle'), [
          Row(children: [
            Expanded(
              child: OutlinedButton(
                style: OutlinedButton.styleFrom(
                  backgroundColor: locale.code == 'en' ? AppColors.primary : null,
                  foregroundColor: locale.code == 'en' ? Colors.white : null,
                ),
                onPressed: () => context.read<LocaleProvider>().setLang('en'),
                child: Text(context.tr('settings.english')),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: OutlinedButton(
                style: OutlinedButton.styleFrom(
                  backgroundColor: locale.code == 'ta' ? AppColors.primary : null,
                  foregroundColor: locale.code == 'ta' ? Colors.white : null,
                ),
                onPressed: () => context.read<LocaleProvider>().setLang('ta'),
                child: Text(context.tr('settings.tamil')),
              ),
            ),
          ]),
        ], subtitle: context.tr('settings.languageSubtitle')),
      ]),
    );
  }
}
