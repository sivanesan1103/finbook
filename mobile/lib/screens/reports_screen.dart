import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../core/api_client.dart';
import '../core/file_share.dart';
import '../core/formatters.dart';
import '../core/theme.dart';
import '../l10n/translations.dart';
import '../providers/app_state.dart';
import '../widgets/common.dart';

class ReportsScreen extends StatefulWidget {
  const ReportsScreen({super.key});
  @override
  State<ReportsScreen> createState() => _ReportsScreenState();
}

class _ReportsScreenState extends State<ReportsScreen> {
  Map<String, dynamic>? data;
  bool loadFailed = false;
  late DateTime from, to;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    from = DateTime(now.year, now.month, 1);
    to = now;
    _load();
  }

  Future<void> _load() async {
    final app = context.read<AppState>();
    try {
      final res = await ApiClient.instance.get(
          '${app.basePath}/reports/dashboard?from=${from.toUtc().toIso8601String()}&to=${to.toUtc().toIso8601String()}');
      if (mounted) setState(() { data = res['data']; loadFailed = false; });
    } catch (e) {
      if (mounted) {
        showSnack(context, e.toString(), error: true);
        setState(() => loadFailed = true);
      }
    }
  }

  Future<void> _pickDate(bool start) async {
    final picked = await showDatePicker(
        context: context, initialDate: start ? from : to, firstDate: DateTime(2020), lastDate: DateTime.now());
    if (picked != null) {
      setState(() => start ? from = picked : to = picked);
      _load();
    }
  }

  Widget _dateField(String label, DateTime value, VoidCallback onTap) => InkWell(
        borderRadius: BorderRadius.circular(8),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 12),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(label, style: const TextStyle(fontSize: 11, color: Colors.black45)),
            const SizedBox(height: 2),
            Row(children: [
              const Icon(Icons.calendar_today, size: 14, color: AppColors.primary),
              const SizedBox(width: 6),
              Text(fmtDate(value), style: const TextStyle(fontWeight: FontWeight.w700)),
            ]),
          ]),
        ),
      );

  /// Overall net position for the selected period — the one number that
  /// answers "am I ahead or behind right now", up front before the
  /// module-by-module breakdown.
  Widget _heroCard(double net) {
    final positive = net >= 0;
    final color = positive ? AppColors.gave : AppColors.got;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 18, horizontal: 16),
      decoration: BoxDecoration(
        color: color.withOpacity(0.08),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withOpacity(0.25)),
      ),
      child: Column(children: [
        Text(context.tr('reports.netPosition'),
            style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: color.withOpacity(0.85))),
        const SizedBox(height: 4),
        Text(inr(net.abs()), style: TextStyle(fontSize: 28, fontWeight: FontWeight.w900, color: color)),
        Text(positive ? context.tr('reports.netPositionGet') : context.tr('reports.netPositionGive'),
            style: TextStyle(fontSize: 12, color: color.withOpacity(0.85))),
      ]),
    );
  }

  Widget _downloadRow({required IconData icon, required String label, required VoidCallback onTap}) => InkWell(
        borderRadius: BorderRadius.circular(8),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 6),
          child: Row(children: [
            Icon(icon, size: 20, color: AppColors.primary),
            const SizedBox(width: 12),
            Expanded(child: Text(label, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14))),
            const Icon(Icons.file_download_outlined, size: 18, color: Colors.black38),
          ]),
        ),
      );

  Widget _sectionTitle(IconData icon, String text) => Padding(
        padding: const EdgeInsets.fromLTRB(4, 18, 4, 8),
        child: Row(children: [
          Icon(icon, size: 15, color: AppColors.primary),
          const SizedBox(width: 6),
          Text(text.toUpperCase(),
              style: const TextStyle(fontWeight: FontWeight.w800, color: Colors.black54, fontSize: 12, letterSpacing: 0.4)),
        ]),
      );

  Widget _tableRow(String label, String value, {Color? color, bool last = false}) => Container(
        decoration: BoxDecoration(
          border: last ? null : const Border(bottom: BorderSide(color: Color(0xFFEEEEEE))),
        ),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
        child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
          Text(label, style: const TextStyle(color: Colors.black87)),
          Text(value, style: TextStyle(fontWeight: FontWeight.w800, color: color, fontSize: 15)),
        ]),
      );

  Widget _table(List<Widget> rows) => Container(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: const Color(0xFFEEEEEE)),
        ),
        clipBehavior: Clip.antiAlias,
        child: Column(children: rows),
      );

  @override
  Widget build(BuildContext context) {
    final d = data;
    final app = context.read<AppState>();
    return Scaffold(
      backgroundColor: AppColors.surface,
      appBar: AppBar(title: Text(context.tr('reports.title'))),
      body: d == null
          ? (loadFailed ? RetryState(onRetry: _load) : const Center(child: CircularProgressIndicator()))
          : ListView(padding: const EdgeInsets.all(14), children: [
              // ── Period picker ──
              Container(
                padding: const EdgeInsets.all(4),
                decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: const Color(0xFFEEEEEE))),
                child: Row(children: [
                  Expanded(child: _dateField(context.tr('reports.start'), from, () => _pickDate(true))),
                  Container(width: 1, height: 34, color: const Color(0xFFEEEEEE)),
                  Expanded(child: _dateField(context.tr('reports.end'), to, () => _pickDate(false))),
                ]),
              ),

              // ── Hero: net position ──
              const SizedBox(height: 14),
              _heroCard(
                (d['ledger']['youWillGet'] as num).toDouble() - (d['ledger']['youWillGive'] as num).toDouble(),
              ),

              _sectionTitle(Icons.menu_book_outlined, context.tr('reports.ledger')),
              _table([
                _tableRow(context.tr('reports.youWillGet'), inr((d['ledger']['youWillGet'] as num).toDouble()), color: AppColors.gave),
                _tableRow(context.tr('reports.youWillGive'), inr((d['ledger']['youWillGive'] as num).toDouble()), color: AppColors.got, last: true),
              ]),
              _sectionTitle(Icons.account_balance_wallet_outlined, context.tr('reports.cashbook')),
              _table([
                _tableRow(context.tr('reports.cashIn'), inr((d['cash']['in'] as num).toDouble()), color: AppColors.got),
                _tableRow(context.tr('reports.cashOut'), inr((d['cash']['out'] as num).toDouble()), color: AppColors.gave, last: true),
              ]),
              _sectionTitle(Icons.receipt_long_outlined, context.tr('reports.sales')),
              _table([
                _tableRow(context.tr('reports.billedCount', {'count': d['sales']['invoiceCount']}), inr((d['sales']['billed'] as num).toDouble())),
                _tableRow(context.tr('reports.collected'), inr((d['sales']['collected'] as num).toDouble()), color: AppColors.got, last: true),
              ]),
              _sectionTitle(Icons.payments_outlined, context.tr('reports.expenses')),
              _table([
                _tableRow(context.tr('reports.expenses'), inr((d['expenses'] as num).toDouble()), last: true),
              ]),
              _sectionTitle(Icons.groups_outlined, context.tr('reports.parties')),
              _table([
                _tableRow(context.tr('reports.customers'), '${d['parties']['customers']}'),
                _tableRow(context.tr('reports.suppliers'), '${d['parties']['suppliers']}', last: true),
              ]),

              // ── Downloads ──
              _sectionTitle(Icons.download_outlined, context.tr('reports.downloads')),
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: const Color(0xFFEEEEEE))),
                child: Column(children: [
                  _downloadRow(
                    icon: Icons.swap_horiz,
                    label: context.tr('reports.downloadTransactionsReport'),
                    onTap: () => downloadAndShare(context,
                        path: '${app.basePath}/reports/transactions.pdf?from=${from.toUtc().toIso8601String()}&to=${to.toUtc().toIso8601String()}',
                        filename: 'transactions-report.pdf', subject: 'Transactions report'),
                  ),
                  const Divider(height: 1),
                  _downloadRow(
                    icon: Icons.receipt_long_outlined,
                    label: context.tr('reports.downloadSalesReport'),
                    onTap: () => downloadAndShare(context,
                        path: '${app.basePath}/reports/sales.pdf?from=${from.toUtc().toIso8601String()}&to=${to.toUtc().toIso8601String()}',
                        filename: 'sales-report.pdf', subject: 'Sales report'),
                  ),
                  const Divider(height: 1),
                  _downloadRow(
                    icon: Icons.account_balance_wallet_outlined,
                    label: context.tr('reports.downloadCashbookReport'),
                    onTap: () => downloadAndShare(context,
                        path: '${app.basePath}/cashbook/report.pdf?from=${from.toUtc().toIso8601String()}&to=${to.toUtc().toIso8601String()}',
                        filename: 'cashbook-report.pdf', subject: 'Cashbook report'),
                  ),
                ]),
              ),
              const SizedBox(height: 10),
            ]),
    );
  }
}
