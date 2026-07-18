import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../core/api_client.dart';
import '../core/formatters.dart';
import '../core/theme.dart';
import '../models/models.dart';
import '../providers/app_state.dart';
import '../widgets/common.dart';

const _kUnits = ['PCS', 'KG', 'G', 'L', 'ML', 'BAG', 'BOX', 'M'];

class ItemsTab extends StatefulWidget {
  const ItemsTab({super.key});
  @override
  State<ItemsTab> createState() => _ItemsTabState();
}

class _ItemsTabState extends State<ItemsTab> with SingleTickerProviderStateMixin {
  late final TabController tabCtrl;
  List<Item> items = [];
  bool loading = true;

  @override
  void initState() {
    super.initState();
    tabCtrl = TabController(length: 2, vsync: this);
    tabCtrl.addListener(() { if (!tabCtrl.indexIsChanging) setState(() {}); });
    _load();
  }

  @override
  void dispose() {
    tabCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final app = context.read<AppState>();
    if (app.business == null) return;
    setState(() => loading = true);
    final res = await ApiClient.instance.get('${app.basePath}/items?limit=200');
    if (!mounted) return;
    setState(() {
      items = (res['data'] as List).map((i) => Item.fromJson(i)).toList();
      loading = false;
    });
  }

  List<Item> get products => items.where((i) => !i.isService).toList();
  List<Item> get services => items.where((i) => i.isService).toList();
  double get stockValue =>
      products.fold(0.0, (s, i) => s + i.stockQty * (i.purchasePrice ?? i.salePrice));
  int get lowCount => products.where((i) => i.isLow).length;

  Future<void> _addItem() async {
    bool isService = tabCtrl.index == 1;
    final name = TextEditingController();
    final price = TextEditingController();
    final stock = TextEditingController();
    final lowAlert = TextEditingController();
    String unit = 'PCS';
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => Padding(
        padding: EdgeInsets.fromLTRB(20, 20, 20, MediaQuery.of(ctx).viewInsets.bottom + 20),
        child: StatefulBuilder(
          builder: (ctx, setSheet) => SingleChildScrollView(
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(isService ? 'Add Service' : 'Add Product', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
              const SizedBox(height: 14),
              SegmentedButton<bool>(
                segments: const [
                  ButtonSegment(value: false, label: Text('Product')),
                  ButtonSegment(value: true, label: Text('Service')),
                ],
                selected: {isService},
                onSelectionChanged: (s) => setSheet(() => isService = s.first),
              ),
              const SizedBox(height: 14),
              TextField(controller: name, autofocus: true,
                  decoration: InputDecoration(labelText: isService ? 'Service name' : 'Item name')),
              const SizedBox(height: 10),
              TextField(controller: price, keyboardType: TextInputType.number,
                  decoration: const InputDecoration(labelText: 'Sale price ₹')),
              if (!isService) ...[
                const SizedBox(height: 10),
                DropdownButtonFormField<String>(
                  value: unit,
                  decoration: const InputDecoration(labelText: 'Unit'),
                  items: _kUnits.map((u) => DropdownMenuItem(value: u, child: Text(u))).toList(),
                  onChanged: (v) => setSheet(() => unit = v!),
                ),
                const SizedBox(height: 10),
                TextField(controller: stock, keyboardType: TextInputType.number,
                    decoration: const InputDecoration(labelText: 'Opening stock (optional)')),
                const SizedBox(height: 10),
                TextField(controller: lowAlert, keyboardType: TextInputType.number,
                    decoration: const InputDecoration(labelText: 'Low stock alert (optional)')),
              ],
              const SizedBox(height: 14),
              ElevatedButton(onPressed: () => Navigator.pop(ctx, true),
                  child: Text('SAVE ${isService ? 'SERVICE' : 'PRODUCT'}')),
            ]),
          ),
        ),
      ),
    );
    if (saved != true || name.text.isEmpty || price.text.isEmpty || !mounted) return;
    try {
      final app = context.read<AppState>();
      await ApiClient.instance.post('${app.basePath}/items', {
        'name': name.text.trim(),
        'salePrice': double.parse(price.text),
        'unit': isService ? kServiceUnit : unit,
        if (!isService && stock.text.isNotEmpty) 'stockQty': double.parse(stock.text),
        if (!isService && lowAlert.text.isNotEmpty) 'lowStockAlert': double.parse(lowAlert.text),
      });
      setState(() => tabCtrl.index = isService ? 1 : 0);
      _load();
    } catch (e) {
      if (mounted) showSnack(context, e.toString(), error: true);
    }
  }

  Future<void> _adjust(Item item) async {
    final qty = TextEditingController();
    String type = 'IN';
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setD) => AlertDialog(
          title: Text('Adjust stock — ${item.name}'),
          content: Column(mainAxisSize: MainAxisSize.min, children: [
            DropdownButtonFormField<String>(
              value: type,
              items: const [
                DropdownMenuItem(value: 'IN', child: Text('Stock IN')),
                DropdownMenuItem(value: 'OUT', child: Text('Stock OUT')),
                DropdownMenuItem(value: 'ADJUST', child: Text('Set quantity')),
              ],
              onChanged: (v) => setD(() => type = v!),
            ),
            TextField(controller: qty, keyboardType: TextInputType.number,
                decoration: const InputDecoration(labelText: 'Quantity')),
          ]),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
            ElevatedButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Apply')),
          ],
        ),
      ),
    );
    if (ok != true || qty.text.isEmpty || !mounted) return;
    try {
      final app = context.read<AppState>();
      await ApiClient.instance.post('${app.basePath}/items/${item.id}/stock',
          {'type': type, 'qty': double.parse(qty.text)});
      _load();
    } catch (e) {
      if (mounted) showSnack(context, e.toString(), error: true);
    }
  }

  Future<void> _delete(Item item) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Delete "${item.name}"?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Delete')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    final app = context.read<AppState>();
    await ApiClient.instance.delete('${app.basePath}/items/${item.id}');
    _load();
  }

  Widget _list(List<Item> list, bool service) {
    if (loading) return const Center(child: CircularProgressIndicator());
    return RefreshIndicator(
      onRefresh: _load,
      child: list.isEmpty
          ? ListView(physics: const AlwaysScrollableScrollPhysics(), children: [
              Padding(
                padding: const EdgeInsets.only(top: 80),
                child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                  Icon(service ? Icons.miscellaneous_services : Icons.inventory_2, size: 64, color: Colors.black12),
                  const SizedBox(height: 8),
                  Text('No ${service ? 'services' : 'products'} yet', style: const TextStyle(fontWeight: FontWeight.w700), textAlign: TextAlign.center),
                  Text(service ? 'Add services like Repair, Delivery, Consulting' : 'Add products to bill faster and track stock',
                      style: const TextStyle(color: Colors.black45, fontSize: 12), textAlign: TextAlign.center),
                ]),
              ),
            ])
          : ListView.separated(
        padding: const EdgeInsets.only(bottom: 90),
        itemCount: list.length,
        separatorBuilder: (_, __) => const Divider(height: 1),
        itemBuilder: (_, i) {
          final it = list[i];
          return ListTile(
            tileColor: Colors.white,
            leading: CircleAvatar(
                backgroundColor: const Color(0xFFE8F0FE),
                child: Icon(service ? Icons.miscellaneous_services : Icons.inventory_2_outlined, color: AppColors.primary)),
            title: Row(children: [
              Flexible(child: Text(it.name, style: const TextStyle(fontWeight: FontWeight.w700))),
              if (it.isLow)
                Container(
                  margin: const EdgeInsets.only(left: 6),
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                  decoration: BoxDecoration(color: const Color(0xFFFBE9EA), borderRadius: BorderRadius.circular(4)),
                  child: const Text('LOW', style: TextStyle(fontSize: 9, color: AppColors.gave, fontWeight: FontWeight.w800)),
                ),
            ]),
            subtitle: Text(service ? 'GST ${it.taxRate}%' : 'Stock: ${it.stockQty} ${it.unit} · GST ${it.taxRate}%'),
            trailing: Row(mainAxisSize: MainAxisSize.min, children: [
              Text(inr(it.salePrice), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
              IconButton(icon: const Icon(Icons.delete_outline, size: 20, color: Colors.black38), onPressed: () => _delete(it)),
            ]),
            onTap: service ? null : () => _adjust(it),
          );
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.surface,
      appBar: AppBar(
        title: const Text('Items'),
        bottom: TabBar(
          controller: tabCtrl,
          onTap: (_) => setState(() {}),
          indicatorColor: AppColors.accentYellow,
          indicatorWeight: 4,
          labelColor: Colors.white,
          unselectedLabelColor: Colors.white60,
          labelStyle: const TextStyle(fontWeight: FontWeight.w800, letterSpacing: 1),
          tabs: [Tab(text: 'PRODUCTS (${products.length})'), Tab(text: 'SERVICES (${services.length})')],
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        heroTag: 'add-item',
        backgroundColor: AppColors.primary,
        onPressed: _addItem,
        icon: const Icon(Icons.add, color: Colors.white),
        label: Text(tabCtrl.index == 1 ? 'ADD SERVICE' : 'ADD PRODUCT',
            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800)),
      ),
      body: Column(children: [
        Container(
          color: Colors.white,
          padding: const EdgeInsets.all(14),
          child: Row(children: [
            Expanded(child: Column(children: [
              const Text('Stock value', style: TextStyle(color: Colors.black54, fontSize: 12)),
              Text(inr(stockValue), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
            ])),
            Expanded(child: Column(children: [
              const Text('Low stock', style: TextStyle(color: Colors.black54, fontSize: 12)),
              Text('$lowCount', style: TextStyle(
                  fontWeight: FontWeight.w800, fontSize: 16, color: lowCount > 0 ? AppColors.gave : Colors.black87)),
            ])),
          ]),
        ),
        const Divider(height: 1),
        Expanded(child: TabBarView(controller: tabCtrl, children: [
          _list(products, false),
          _list(services, true),
        ])),
      ]),
    );
  }
}
