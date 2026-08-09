import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../core/api_client.dart';
import '../core/formatters.dart';
import '../core/theme.dart';
import '../l10n/translations.dart';
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
    try {
      final res = await ApiClient.instance.get('${app.basePath}/expenses?limit=100');
      if (!mounted) return;
      setState(() {
        rows = (res['data'] as List).map((e) => Expense.fromJson(e)).toList();
        total = (res['summary']['totalAmount'] as num).toDouble();
      });
    } catch (e) {
      if (mounted) showSnack(context, e.toString(), error: true);
    } finally {
      if (mounted) setState(() => loading = false);
    }
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
        title: Text(context.tr('expensesTab.confirmDeleteTitle')),
        content: Text(context.tr('expensesTab.confirmDeleteBody', {'category': e.category, 'amount': inr(e.amount)})),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(context.tr('expensesTab.cancel'))),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: Text(context.tr('expensesTab.delete'))),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    try {
      final app = context.read<AppState>();
      await ApiClient.instance.delete('${app.basePath}/expenses/${e.id}');
      _load();
    } catch (err) {
      if (mounted) showSnack(context, err.toString(), error: true);
    }
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
    bool saving = false;

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
            if (selected == null || amount.text.isEmpty || saving) return;
            setSheet(() => saving = true);
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
              if (ctx.mounted) {
                showSnack(ctx, e.toString(), error: true);
                setSheet(() => saving = false);
              }
            }
          }

          final visible = items
              .where((i) => i.name.toLowerCase().contains(search.text.trim().toLowerCase()))
              .toList();

          return Padding(
            // viewPadding.bottom clears the system nav bar (3-button nav) —
            // without it the primary action button renders under the nav bar
            // and isn't tappable.
            padding: EdgeInsets.fromLTRB(20, 20, 20,
                MediaQuery.of(ctx).viewInsets.bottom + MediaQuery.of(ctx).viewPadding.bottom + 20),
            child: selected == null
                // ── Step 1: pick or create an expense item ──
                ? ConstrainedBox(
                    constraints: BoxConstraints(maxHeight: MediaQuery.of(ctx).size.height * 0.75),
                    child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(context.tr('expensesTab.selectExpenseItem'), style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
                      const SizedBox(height: 6),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                        decoration: BoxDecoration(color: const Color(0xFFFFF6E0), borderRadius: BorderRadius.circular(8)),
                        child: Text(context.tr('expensesTab.inventoryNote'), style: const TextStyle(fontSize: 11)),
                      ),
                      const SizedBox(height: 10),
                      TextField(
                        controller: search,
                        onChanged: (_) => setSheet(() {}),
                        decoration: InputDecoration(hintText: context.tr('expensesTab.searchExpenseItem'), prefixIcon: const Icon(Icons.search)),
                      ),
                      const SizedBox(height: 10),
                      Flexible(
                        child: visible.isEmpty
                            ? Padding(
                                padding: const EdgeInsets.symmetric(vertical: 16),
                                child: Text(items.isEmpty ? context.tr('expensesTab.noExpenseItemsYet') : context.tr('expensesTab.noItemsMatch'),
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
                          label: Text(context.tr('expensesTab.addNewExpenseItem')),
                        )
                      else
                        Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          TextField(controller: newName, autofocus: true,
                              decoration: InputDecoration(labelText: context.tr('expensesTab.expenseItemName'))),
                          const SizedBox(height: 8),
                          TextField(controller: newPrice, keyboardType: TextInputType.number,
                              decoration: InputDecoration(labelText: context.tr('expensesTab.priceOptional'), prefixText: '₹ ')),
                          const SizedBox(height: 10),
                          Row(children: [
                            Expanded(child: OutlinedButton(onPressed: () => setSheet(() => creatingNew = false), child: Text(context.tr('expensesTab.cancel')))),
                            const SizedBox(width: 10),
                            Expanded(child: ElevatedButton(onPressed: saveNewItem, child: Text(context.tr('expensesTab.save')))),
                          ]),
                        ]),
                    ]),
                  )
                // ── Step 2: enter amount ──
                : Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
                    TextButton.icon(
                      onPressed: () => setSheet(() => selected = null),
                      icon: const Icon(Icons.arrow_back, size: 16),
                      label: Text(context.tr('expensesTab.changeExpenseItem')),
                    ),
                    Text(selected!.name, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
                    const SizedBox(height: 14),
                    TextField(controller: amount, autofocus: true,
                        keyboardType: const TextInputType.numberWithOptions(decimal: true),
                        style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800),
                        decoration: InputDecoration(labelText: context.tr('expensesTab.amount'), prefixText: '₹ ')),
                    const SizedBox(height: 10),
                    TextField(controller: notes, decoration: InputDecoration(labelText: context.tr('expensesTab.notesOptional'))),
                    const SizedBox(height: 10),
                    DropdownButtonFormField<String>(
                      value: payMode,
                      decoration: InputDecoration(labelText: context.tr('expensesTab.paymentMode')),
                      items: _kModes.map((m) => DropdownMenuItem(value: m, child: Text(context.tr(modeLabelKeys[m]!)))).toList(),
                      onChanged: (v) => setSheet(() => payMode = v!),
                    ),
                    const SizedBox(height: 14),
                    ElevatedButton(
                      onPressed: saving ? null : saveExpense,
                      child: saving
                          ? const SizedBox(width: 20, height: 20,
                              child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                          : Text(context.tr('expensesTab.saveExpense')),
                    ),
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
      appBar: AppBar(title: Text(context.tr('expensesTab.title'))),
      floatingActionButton: FloatingActionButton.extended(
        heroTag: 'add-expense',
        backgroundColor: AppColors.primary,
        onPressed: _addExpense,
        icon: const Icon(Icons.add, color: Colors.white),
        label: Text(context.tr('expensesTab.addExpense'), style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800)),
      ),
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : Column(children: [
              Container(
                color: Colors.white,
                padding: const EdgeInsets.all(14),
                child: Row(children: [
                  Expanded(child: Column(children: [
                    Text(context.tr('expensesTab.total'), textAlign: TextAlign.center, maxLines: 2, style: const TextStyle(color: Colors.black54, fontSize: 12)),
                    FittedBox(fit: BoxFit.scaleDown, child: Text(inr(total), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16))),
                  ])),
                  Expanded(child: Column(children: [
                    Text(context.tr('expensesTab.thisMonth'), textAlign: TextAlign.center, maxLines: 2, style: const TextStyle(color: Colors.black54, fontSize: 12)),
                    FittedBox(fit: BoxFit.scaleDown, child: Text(inr(_thisMonth), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16))),
                  ])),
                  Expanded(child: Column(children: [
                    Text(context.tr('expensesTab.entries'), textAlign: TextAlign.center, maxLines: 2, style: const TextStyle(color: Colors.black54, fontSize: 12)),
                    Text('${rows.length}', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                  ])),
                ]),
              ),
              const Divider(height: 1),
              Expanded(
                child: RefreshIndicator(
                  onRefresh: _load,
                  child: rows.isEmpty
                      ? ListView(physics: const AlwaysScrollableScrollPhysics(), children: [
                          Padding(
                            padding: const EdgeInsets.only(top: 80),
                            child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                              const Icon(Icons.receipt_outlined, size: 64, color: Colors.black12),
                              const SizedBox(height: 8),
                              Text(context.tr('expensesTab.noExpensesYet'), style: const TextStyle(fontWeight: FontWeight.w700), textAlign: TextAlign.center),
                              Text(context.tr('expensesTab.noExpensesSubtitle'),
                                  style: const TextStyle(color: Colors.black45, fontSize: 12), textAlign: TextAlign.center),
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
                              subtitle: Text('${fmtDate(e.entryDate)} · ${context.tr(modeLabelKeys[e.paymentMode] ?? e.paymentMode)}${e.notes != null ? ' · ${e.notes}' : ''}',
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
