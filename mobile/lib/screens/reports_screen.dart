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
          '${app.basePath}/reports/dashboard?from=${from.toIso8601String()}&to=${to.toIso8601String()}');
      if (mounted) setState(() => data = res['data']);
    } catch (e) {
      if (mounted) showSnack(context, e.toString(), error: true);
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

  Widget _sectionTitle(String text) => Padding(
        padding: const EdgeInsets.fromLTRB(4, 16, 4, 6),
        child: Text(text, style: const TextStyle(fontWeight: FontWeight.w800, color: Colors.black54)),
      );

  Widget _tableRow(String label, String value, {Color? color, bool last = false}) => Container(
        decoration: BoxDecoration(
          border: last ? null : const Border(bottom: BorderSide(color: Color(0xFFEEEEEE))),
        ),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
          Text(label, style: const TextStyle(color: Colors.black87)),
          Text(value, style: TextStyle(fontWeight: FontWeight.w800, color: color)),
        ]),
      );

  Widget _table(List<Widget> rows) => Container(
        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(10)),
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
          ? const Center(child: CircularProgressIndicator())
          : ListView(padding: const EdgeInsets.all(14), children: [
              Row(children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => _pickDate(true),
                    icon: const Icon(Icons.calendar_today, size: 16),
                    label: Text(fmtDate(from)),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => _pickDate(false),
                    icon: const Icon(Icons.calendar_today, size: 16),
                    label: Text(fmtDate(to)),
                  ),
                ),
              ]),
              const SizedBox(height: 6),
              _sectionTitle(context.tr('reports.ledger')),
              _table([
                _tableRow(context.tr('reports.youWillGet'), inr((d['ledger']['youWillGet'] as num).toDouble()), color: AppColors.gave),
                _tableRow(context.tr('reports.youWillGive'), inr((d['ledger']['youWillGive'] as num).toDouble()), color: AppColors.got, last: true),
              ]),
              _sectionTitle(context.tr('reports.cashbook')),
              _table([
                _tableRow(context.tr('reports.cashIn'), inr((d['cash']['in'] as num).toDouble()), color: AppColors.got),
                _tableRow(context.tr('reports.cashOut'), inr((d['cash']['out'] as num).toDouble()), color: AppColors.gave, last: true),
              ]),
              _sectionTitle(context.tr('reports.sales')),
              _table([
                _tableRow(context.tr('reports.billedCount', {'count': d['sales']['invoiceCount']}), inr((d['sales']['billed'] as num).toDouble())),
                _tableRow(context.tr('reports.collected'), inr((d['sales']['collected'] as num).toDouble()), color: AppColors.got, last: true),
              ]),
              _sectionTitle(context.tr('reports.expenses')),
              _table([
                _tableRow(context.tr('reports.expenses'), inr((d['expenses'] as num).toDouble()), last: true),
              ]),
              _sectionTitle(context.tr('reports.parties')),
              _table([
                _tableRow(context.tr('reports.customers'), '${d['parties']['customers']}'),
                _tableRow(context.tr('reports.suppliers'), '${d['parties']['suppliers']}', last: true),
              ]),
              const SizedBox(height: 20),
              OutlinedButton.icon(
                onPressed: () => downloadAndShare(context,
                    path: '${app.basePath}/reports/transactions.pdf?from=${from.toIso8601String()}&to=${to.toIso8601String()}',
                    filename: 'transactions-report.pdf', subject: 'Transactions report'),
                icon: const Icon(Icons.picture_as_pdf_outlined),
                label: Text(context.tr('reports.downloadTransactionsReport')),
              ),
              const SizedBox(height: 10),
              OutlinedButton.icon(
                onPressed: () => downloadAndShare(context,
                    path: '${app.basePath}/reports/sales.pdf?from=${from.toIso8601String()}&to=${to.toIso8601String()}',
                    filename: 'sales-report.pdf', subject: 'Sales report'),
                icon: const Icon(Icons.picture_as_pdf_outlined),
                label: Text(context.tr('reports.downloadSalesReport')),
              ),
              const SizedBox(height: 10),
              ElevatedButton.icon(
                onPressed: () => downloadAndShare(context,
                    path: '${app.basePath}/cashbook/report.pdf?from=${from.toIso8601String()}&to=${to.toIso8601String()}',
                    filename: 'cashbook-report.pdf', subject: 'Cashbook report'),
                icon: const Icon(Icons.picture_as_pdf_outlined),
                label: Text(context.tr('reports.downloadCashbookReport')),
              ),
            ]),
    );
  }
}
