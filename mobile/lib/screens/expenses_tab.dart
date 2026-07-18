import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../core/api_client.dart';
import '../core/formatters.dart';
import '../core/theme.dart';
import '../models/models.dart';
import '../providers/app_state.dart';
import '../widgets/common.dart';

const _kModes = ['CASH', 'ONLINE', 'UPI', 'BANK', 'CHEQUE'];

class ExpensesTab extends StatefulWidget {
  const ExpensesTab({super.key});
  @override
  State<ExpensesTab> createState() => _ExpensesTabState();
}

class _ExpensesTabState extends State<ExpensesTab> {
  List<Expense> rows = [];
  double total = 0;
  bool loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final app = context.read<AppState>();
    if (app.business == null) return;
    setState(() => loading = true);
    final res = await ApiClient.instance.get('${app.basePath}/expenses?limit=100');
    if (!mounted) return;
    setState(() {
      rows = (res['data'] as List).map((e) => Expense.fromJson(e)).toList();
      total = (res['summary']['totalAmount'] as num).toDouble();
      loading = false;
    });
  }

  double get _thisMonth {
    final now = DateTime.now();
    return rows
        .where((e) => e.entryDate.year == now.year && e.entryDate.month == now.month)
        .fold(0.0, (s, e) => s + e.amount);
  }

  Future<void> _remove(Expense e) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete expense?'),
        content: Text('${e.category} · ${inr(e.amount)}'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Delete')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    final app = context.read<AppState>();
    await ApiClient.instance.delete('${app.basePath}/expenses/${e.id}');
    _load();
  }

  Future<void> _addExpense() async {
    final app = context.read<AppState>();
    final api = ApiClient.instance;
    final itemsRes = await api.get('${app.basePath}/expenses/items');
    if (!mounted) return;
    var items = (itemsRes['data'] as List).map((i) => ExpenseItem.fromJson(i)).toList();

    ExpenseItem? selected;
    final search = TextEditingController();
    final newName = TextEditingController();
    final newPrice = TextEditingController();
    bool creatingNew = false;

    final amount = TextEditingController();
    final notes = TextEditingController();
    String payMode = 'CASH';

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheet) {
          Future<void> saveNewItem() async {
            if (newName.text.trim().isEmpty) return;
            try {
              final res = await api.post('${app.basePath}/expenses/items', {
                'name': newName.text.trim(),
                if (newPrice.text.isNotEmpty) 'price': double.parse(newPrice.text),
              });
              final created = ExpenseItem.fromJson(res['data']);
              setSheet(() {
                items = [...items, created];
                creatingNew = false;
                newName.clear();
                newPrice.clear();
                selected = created;
                amount.text = created.price != null ? created.price!.toStringAsFixed(0) : '';
              });
            } catch (e) {
              if (ctx.mounted) showSnack(ctx, e.toString(), error: true);
            }
          }

          Future<void> saveExpense() async {
            if (selected == null || amount.text.isEmpty) return;
            try {
              await api.post('${app.basePath}/expenses', {
                'category': selected!.name,
                'amount': double.parse(amount.text),
                if (notes.text.trim().isNotEmpty) 'notes': notes.text.trim(),
                'paymentMode': payMode,
              });
              if (ctx.mounted) Navigator.pop(ctx);
              _load();
            } catch (e) {
              if (ctx.mounted) showSnack(ctx, e.toString(), error: true);
            }
          }

          final visible = items
              .where((i) => i.name.toLowerCase().contains(search.text.trim().toLowerCase()))
              .toList();

          return Padding(
            padding: EdgeInsets.fromLTRB(20, 20, 20, MediaQuery.of(ctx).viewInsets.bottom + 20),
            child: selected == null
                // ── Step 1: pick or create an expense item ──
                ? ConstrainedBox(
                    constraints: BoxConstraints(maxHeight: MediaQuery.of(ctx).size.height * 0.75),
                    child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
                      const Text('Select Expense Item', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
                      const SizedBox(height: 6),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                        decoration: BoxDecoration(color: const Color(0xFFFFF6E0), borderRadius: BorderRadius.circular(8)),
                        child: const Text('ℹ️ Expense items would not affect your inventory', style: TextStyle(fontSize: 11)),
                      ),
                      const SizedBox(height: 10),
                      TextField(
                        controller: search,
                        onChanged: (_) => setSheet(() {}),
                        decoration: const InputDecoration(hintText: 'Search for an expense item', prefixIcon: Icon(Icons.search)),
                      ),
                      const SizedBox(height: 10),
                      Flexible(
                        child: visible.isEmpty
                            ? Padding(
                                padding: const EdgeInsets.symmetric(vertical: 16),
                                child: Text(items.isEmpty ? 'No expense items yet — add your first one below.' : 'No items match your search.',
                                    style: const TextStyle(color: Colors.black45)),
                              )
                            : ListView.separated(
                                shrinkWrap: true,
                                itemCount: visible.length,
                                separatorBuilder: (_, __) => const Divider(height: 1),
                                itemBuilder: (_, i) {
                                  final it = visible[i];
                                  return ListTile(
                                    dense: true,
                                    title: Text(it.name, style: const TextStyle(fontWeight: FontWeight.w600)),
                                    trailing: it.price != null ? Text(inr(it.price!)) : null,
                                    onTap: () => setSheet(() {
                                      selected = it;
                                      amount.text = it.price != null ? it.price!.toStringAsFixed(0) : '';
                                    }),
                                  );
                                },
                              ),
                      ),
                      const SizedBox(height: 8),
                      if (!creatingNew)
                        OutlinedButton.icon(
                          onPressed: () => setSheet(() => creatingNew = true),
                          icon: const Icon(Icons.add),
                          label: const Text('Add new expense item'),
                        )
                      else
                        Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          TextField(controller: newName, autofocus: true,
                              decoration: const InputDecoration(labelText: 'Expense item name')),
                          const SizedBox(height: 8),
                          TextField(controller: newPrice, keyboardType: TextInputType.number,
                              decoration: const InputDecoration(labelText: 'Price (optional)', prefixText: '₹ ')),
                          const SizedBox(height: 10),
                          Row(children: [
                            Expanded(child: OutlinedButton(onPressed: () => setSheet(() => creatingNew = false), child: const Text('Cancel'))),
                            const SizedBox(width: 10),
                            Expanded(child: ElevatedButton(onPressed: saveNewItem, child: const Text('Save'))),
                          ]),
                        ]),
                    ]),
                  )
                // ── Step 2: enter amount ──
                : Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
                    TextButton.icon(
                      onPressed: () => setSheet(() => selected = null),
                      icon: const Icon(Icons.arrow_back, size: 16),
                      label: const Text('Change expense item'),
                    ),
                    Text(selected!.name, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
                    const SizedBox(height: 14),
                    TextField(controller: amount, autofocus: true,
                        keyboardType: const TextInputType.numberWithOptions(decimal: true),
                        style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800),
                        decoration: const InputDecoration(labelText: 'Amount', prefixText: '₹ ')),
                    const SizedBox(height: 10),
                    TextField(controller: notes, decoration: const InputDecoration(labelText: 'Notes (optional)')),
                    const SizedBox(height: 10),
                    DropdownButtonFormField<String>(
                      value: payMode,
                      decoration: const InputDecoration(labelText: 'Payment mode'),
                      items: _kModes.map((m) => DropdownMenuItem(value: m, child: Text(m))).toList(),
                      onChanged: (v) => setSheet(() => payMode = v!),
                    ),
                    const SizedBox(height: 14),
                    ElevatedButton(onPressed: saveExpense, child: const Text('SAVE EXPENSE')),
                  ]),
          );
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.surface,
      appBar: AppBar(title: const Text('Expenses')),
      floatingActionButton: FloatingActionButton.extended(
        heroTag: 'add-expense',
        backgroundColor: AppColors.primary,
        onPressed: _addExpense,
        icon: const Icon(Icons.add, color: Colors.white),
        label: const Text('ADD EXPENSE', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800)),
      ),
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : Column(children: [
              Container(
                color: Colors.white,
                padding: const EdgeInsets.all(14),
                child: Row(children: [
                  Expanded(child: Column(children: [
                    const Text('Total', style: TextStyle(color: Colors.black54, fontSize: 12)),
                    Text(inr(total), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                  ])),
                  Expanded(child: Column(children: [
                    const Text('This Month', style: TextStyle(color: Colors.black54, fontSize: 12)),
                    Text(inr(_thisMonth), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                  ])),
                  Expanded(child: Column(children: [
                    const Text('Entries', style: TextStyle(color: Colors.black54, fontSize: 12)),
                    Text('${rows.length}', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                  ])),
                ]),
              ),
              const Divider(height: 1),
              Expanded(
                child: RefreshIndicator(
                  onRefresh: _load,
                  child: rows.isEmpty
                      ? ListView(physics: const AlwaysScrollableScrollPhysics(), children: const [
                          Padding(
                            padding: EdgeInsets.only(top: 80),
                            child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                              Icon(Icons.receipt_outlined, size: 64, color: Colors.black12),
                              SizedBox(height: 8),
                              Text("Yet to add your first expense", style: TextStyle(fontWeight: FontWeight.w700), textAlign: TextAlign.center),
                              Text('Add expenses with reusable expense items',
                                  style: TextStyle(color: Colors.black45, fontSize: 12), textAlign: TextAlign.center),
                            ]),
                          ),
                        ])
                      : ListView.separated(
                          padding: const EdgeInsets.only(bottom: 90),
                          itemCount: rows.length,
                          separatorBuilder: (_, __) => const Divider(height: 1),
                          itemBuilder: (_, i) {
                            final e = rows[i];
                            return ListTile(
                              tileColor: Colors.white,
                              leading: const CircleAvatar(
                                  backgroundColor: Color(0xFFFDECEE),
                                  child: Icon(Icons.receipt_long, color: AppColors.customerFab)),
                              title: Text(e.category, style: const TextStyle(fontWeight: FontWeight.w700)),
                              subtitle: Text('${fmtDate(e.entryDate)} · ${e.paymentMode}${e.notes != null ? ' · ${e.notes}' : ''}',
                                  style: const TextStyle(fontSize: 12), maxLines: 1, overflow: TextOverflow.ellipsis),
                              trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                                Text(inr(e.amount), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                                IconButton(
                                  icon: const Icon(Icons.delete_outline, size: 20, color: Colors.black38),
                                  onPressed: () => _remove(e),
                                ),
                              ]),
                            );
                          },
                        ),
                      ),
              ),
            ]),
    );
  }
}
