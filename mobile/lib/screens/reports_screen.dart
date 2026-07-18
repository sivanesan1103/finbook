import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../core/api_client.dart';
import '../core/file_share.dart';
import '../core/formatters.dart';
import '../core/theme.dart';
import '../providers/app_state.dart';

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
    final res = await ApiClient.instance.get(
        '${app.basePath}/reports/dashboard?from=${from.toIso8601String()}&to=${to.toIso8601String()}');
    if (mounted) setState(() => data = res['data']);
  }

  Future<void> _pickDate(bool start) async {
    final picked = await showDatePicker(
        context: context, initialDate: start ? from : to, firstDate: DateTime(2020), lastDate: DateTime.now());
    if (picked != null) {
      setState(() => start ? from = picked : to = picked);
      _load();
    }
  }

  Widget _stat(String label, double value, {Color? color}) => _statText(label, inr(value), color: color);

  Widget _statText(String label, String text, {Color? color}) => Expanded(
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 14),
          decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(10)),
          child: Column(children: [
            Text(label, style: const TextStyle(color: Colors.black54, fontSize: 12)),
            const SizedBox(height: 4),
            Text(text, style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: color)),
          ]),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final d = data;
    final app = context.read<AppState>();
    return Scaffold(
      backgroundColor: AppColors.surface,
      appBar: AppBar(title: const Text('Reports')),
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
              const SizedBox(height: 14),
              const Text('Ledger', style: TextStyle(fontWeight: FontWeight.w800, color: Colors.black54)),
              const SizedBox(height: 8),
              Row(children: [
                _stat('You will get', (d['ledger']['youWillGet'] as num).toDouble(), color: AppColors.gave),
                const SizedBox(width: 10),
                _stat('You will give', (d['ledger']['youWillGive'] as num).toDouble(), color: AppColors.got),
              ]),
              const SizedBox(height: 16),
              const Text('Cashbook', style: TextStyle(fontWeight: FontWeight.w800, color: Colors.black54)),
              const SizedBox(height: 8),
              Row(children: [
                _stat('Cash In', (d['cash']['in'] as num).toDouble(), color: AppColors.got),
                const SizedBox(width: 10),
                _stat('Cash Out', (d['cash']['out'] as num).toDouble(), color: AppColors.gave),
              ]),
              const SizedBox(height: 16),
              const Text('Sales', style: TextStyle(fontWeight: FontWeight.w800, color: Colors.black54)),
              const SizedBox(height: 8),
              Row(children: [
                _stat('Billed (${d['sales']['invoiceCount']})', (d['sales']['billed'] as num).toDouble()),
                const SizedBox(width: 10),
                _stat('Collected', (d['sales']['collected'] as num).toDouble(), color: AppColors.got),
              ]),
              const SizedBox(height: 16),
              const Text('Expenses', style: TextStyle(fontWeight: FontWeight.w800, color: Colors.black54)),
              const SizedBox(height: 8),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(vertical: 14),
                decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(10)),
                child: Text(inr((d['expenses'] as num).toDouble()),
                    textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
              ),
              const SizedBox(height: 16),
              Row(children: [
                _statText('Customers', '${d['parties']['customers']}'),
                const SizedBox(width: 10),
                _statText('Suppliers', '${d['parties']['suppliers']}'),
              ]),
              const SizedBox(height: 20),
              ElevatedButton.icon(
                onPressed: () => downloadAndShare(context,
                    path: '${app.basePath}/reports/transactions.pdf?from=${from.toIso8601String()}&to=${to.toIso8601String()}',
                    filename: 'transactions-report.pdf', subject: 'Transactions report'),
                icon: const Icon(Icons.picture_as_pdf_outlined),
                label: const Text('DOWNLOAD TRANSACTIONS REPORT'),
              ),
            ]),
    );
  }
}
