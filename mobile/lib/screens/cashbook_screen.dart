import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../core/api_client.dart';
import '../core/formatters.dart';
import '../core/theme.dart';
import '../models/models.dart';
import '../providers/app_state.dart';
import '../widgets/common.dart';

class CashbookScreen extends StatefulWidget {
  const CashbookScreen({super.key});
  @override
  State<CashbookScreen> createState() => _CashbookScreenState();
}

class _CashbookScreenState extends State<CashbookScreen> {
  List<CashEntry> entries = [];
  double totalBalance = 0, todayBalance = 0;
  DateTime date = DateTime.now();
  String mode = 'ALL';
  bool loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => loading = true);
    final app = context.read<AppState>();
    final api = ApiClient.instance;
    final d = date.toIso8601String().substring(0, 10);
    final list = await api.get('${app.basePath}/cashbook?date=$d&paymentMode=$mode&limit=100');
    final sum = await api.get('${app.basePath}/cashbook/summary');
    if (!mounted) return;
    setState(() {
      entries = (list['data'] as List).map((e) => CashEntry.fromJson(e)).toList();
      totalBalance = (sum['data']['totalBalance'] as num).toDouble();
      todayBalance = (sum['data']['todayBalance'] as num).toDouble();
      loading = false;
    });
  }

  Future<void> _add(String direction) async {
    final amount = TextEditingController();
    final desc = TextEditingController();
    String payMode = 'CASH';
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => Padding(
        padding: EdgeInsets.fromLTRB(20, 20, 20, MediaQuery.of(ctx).viewInsets.bottom + 20),
        child: StatefulBuilder(
          builder: (ctx, setSheet) => Column(mainAxisSize: MainAxisSize.min, children: [
            Text(direction == 'IN' ? 'Cash In' : 'Cash Out',
                style: TextStyle(
                    fontSize: 18, fontWeight: FontWeight.w800,
                    color: direction == 'IN' ? AppColors.got : AppColors.gave)),
            const SizedBox(height: 14),
            TextField(controller: amount, autofocus: true,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                decoration: const InputDecoration(labelText: 'Amount', prefixText: '₹ ')),
            const SizedBox(height: 10),
            TextField(controller: desc, decoration: const InputDecoration(labelText: 'Description')),
            const SizedBox(height: 10),
            DropdownButtonFormField<String>(
              value: payMode,
              decoration: const InputDecoration(labelText: 'Payment mode'),
              items: const ['CASH', 'ONLINE', 'UPI', 'BANK', 'CHEQUE']
                  .map((m) => DropdownMenuItem(value: m, child: Text(m))).toList(),
              onChanged: (v) => setSheet(() => payMode = v!),
            ),
            const SizedBox(height: 14),
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                  backgroundColor: direction == 'IN' ? AppColors.got : AppColors.gave),
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('SAVE'),
            ),
          ]),
        ),
      ),
    );
    if (saved != true || amount.text.isEmpty || !mounted) return;
    try {
      final app = context.read<AppState>();
      await ApiClient.instance.post('${app.basePath}/cashbook', {
        'direction': direction,
        'amount': double.parse(amount.text),
        if (desc.text.trim().isNotEmpty) 'description': desc.text.trim(),
        'paymentMode': payMode,
        'entryDate': date.toIso8601String(),
      });
      _load();
    } catch (e) {
      if (mounted) showSnack(context, e.toString(), error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final dayIn = entries.where((e) => e.direction == 'IN').fold(0.0, (s, e) => s + e.amount);
    final dayOut = entries.where((e) => e.direction == 'OUT').fold(0.0, (s, e) => s + e.amount);

    return Scaffold(
      backgroundColor: AppColors.surface,
      appBar: AppBar(title: const Text('Cashbook')),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(children: [
            Expanded(
              child: ElevatedButton(
                style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFFFBE9EA), foregroundColor: AppColors.gave),
                onPressed: () => _add('OUT'),
                child: const Text('OUT'),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: ElevatedButton(
                style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFFEFF7F0), foregroundColor: AppColors.got),
                onPressed: () => _add('IN'),
                child: const Text('IN'),
              ),
            ),
          ]),
        ),
      ),
      body: Column(children: [
        Container(
          color: Colors.white,
          padding: const EdgeInsets.all(14),
          child: Row(children: [
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('Total Balance', style: TextStyle(color: Colors.black54, fontSize: 12)),
              Text(inr(totalBalance), style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
            ])),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text("Today's Balance", style: TextStyle(color: Colors.black54, fontSize: 12)),
              Text(inr(todayBalance), style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
            ])),
          ]),
        ),
        const Divider(height: 1),
        Container(
          color: Colors.white,
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          child: Row(children: [
            Expanded(
              child: OutlinedButton.icon(
                onPressed: () async {
                  final picked = await showDatePicker(
                      context: context, initialDate: date,
                      firstDate: DateTime(2020), lastDate: DateTime.now());
                  if (picked != null) { setState(() => date = picked); _load(); }
                },
                icon: const Icon(Icons.calendar_month, size: 18),
                label: Text(fmtDate(date)),
              ),
            ),
            const SizedBox(width: 10),
            DropdownButton<String>(
              value: mode,
              items: const ['ALL', 'CASH', 'ONLINE', 'UPI', 'BANK', 'CHEQUE']
                  .map((m) => DropdownMenuItem(value: m, child: Text(m))).toList(),
              onChanged: (v) { setState(() => mode = v!); _load(); },
            ),
          ]),
        ),
        ListTile(
          dense: true,
          title: Text('${fmtDate(date)} · ${entries.length} entries',
              style: const TextStyle(fontWeight: FontWeight.w700)),
          trailing: SizedBox(
            width: 190,
            child: Row(mainAxisAlignment: MainAxisAlignment.end, children: [
              Text('OUT ${inr(dayOut)}', style: const TextStyle(color: AppColors.gave, fontSize: 12, fontWeight: FontWeight.w700)),
              const SizedBox(width: 12),
              Text('IN ${inr(dayIn)}', style: const TextStyle(color: AppColors.got, fontSize: 12, fontWeight: FontWeight.w700)),
            ]),
          ),
        ),
        Expanded(
          child: loading
              ? const Center(child: CircularProgressIndicator())
              : RefreshIndicator(
                  onRefresh: _load,
                  child: entries.isEmpty
                      ? ListView(physics: const AlwaysScrollableScrollPhysics(), children: const [
                          Padding(
                            padding: EdgeInsets.only(top: 80),
                            child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                              Icon(Icons.menu_book, size: 64, color: Colors.black12),
                              SizedBox(height: 8),
                              Text('Add your first transaction', style: TextStyle(fontWeight: FontWeight.w700), textAlign: TextAlign.center),
                              Text('Looks a bit empty in here!', style: TextStyle(color: Colors.black45, fontSize: 12), textAlign: TextAlign.center),
                            ]),
                          ),
                        ])
                      : ListView.separated(
                          itemCount: entries.length,
                          separatorBuilder: (_, __) => const Divider(height: 1),
                          itemBuilder: (_, i) {
                            final e = entries[i];
                            final isIn = e.direction == 'IN';
                            return ListTile(
                              tileColor: Colors.white,
                              leading: CircleAvatar(
                                backgroundColor: isIn ? const Color(0xFFEFF7F0) : const Color(0xFFFBE9EA),
                                child: Icon(isIn ? Icons.south_west : Icons.north_east,
                                    color: isIn ? AppColors.got : AppColors.gave, size: 18),
                              ),
                              title: Text(e.description ?? '(no description)'),
                              subtitle: Text('${e.paymentMode} · ${fmtDateTime(e.entryDate)}',
                                  style: const TextStyle(fontSize: 12)),
                              trailing: Text(inr(e.amount),
                                  style: TextStyle(
                                      color: isIn ? AppColors.got : AppColors.gave,
                                      fontWeight: FontWeight.w800, fontSize: 16)),
                            );
                          },
                        ),
                ),
        ),
      ]),
    );
  }
}
