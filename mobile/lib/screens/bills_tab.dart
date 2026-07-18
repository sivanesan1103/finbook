import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../core/api_client.dart';
import '../core/formatters.dart';
import '../core/theme.dart';
import '../models/models.dart';
import '../providers/app_state.dart';
import '../widgets/common.dart';
import 'invoice_detail_screen.dart';

class BillsTab extends StatefulWidget {
  const BillsTab({super.key});
  @override
  State<BillsTab> createState() => _BillsTabState();
}

class _BillsTabState extends State<BillsTab> {
  List<Invoice> invoices = [];
  double billed = 0, collected = 0;
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
    final res = await ApiClient.instance.get('${app.basePath}/invoices?limit=100');
    if (!mounted) return;
    setState(() {
      invoices = (res['data'] as List).map((i) => Invoice.fromJson(i)).toList();
      billed = (res['summary']['totalBilled'] as num).toDouble();
      collected = (res['summary']['totalCollected'] as num).toDouble();
      loading = false;
    });
  }

  Future<void> _createInvoice() async {
    final app = context.read<AppState>();
    final api = ApiClient.instance;
    final partiesRes = await api.get('${app.basePath}/parties?limit=100');
    final parties = (partiesRes['data'] as List).map((p) => Party.fromJson(p)).toList();
    if (!mounted) return;
    if (parties.isEmpty) {
      showSnack(context, 'Add a customer first, then create a bill.', error: true);
      return;
    }

    String partyId = parties.first.id;
    final itemName = TextEditingController();
    final qty = TextEditingController(text: '1');
    final price = TextEditingController();
    final taxRate = TextEditingController(text: '0');
    final discount = TextEditingController();

    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => Padding(
        padding: EdgeInsets.fromLTRB(20, 20, 20, MediaQuery.of(ctx).viewInsets.bottom + 20),
        child: StatefulBuilder(
          builder: (ctx, setSheet) => SingleChildScrollView(
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('New Bill', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
              const SizedBox(height: 14),
              DropdownButtonFormField<String>(
                value: partyId,
                decoration: const InputDecoration(labelText: 'Bill to'),
                items: parties
                    .map((p) => DropdownMenuItem(value: p.id, child: Text('${p.name} (${p.type})')))
                    .toList(),
                onChanged: (v) => setSheet(() => partyId = v!),
              ),
              const SizedBox(height: 10),
              TextField(controller: itemName, decoration: const InputDecoration(labelText: 'Item / description')),
              const SizedBox(height: 10),
              Row(children: [
                Expanded(child: TextField(controller: qty, keyboardType: TextInputType.number,
                    decoration: const InputDecoration(labelText: 'Qty'))),
                const SizedBox(width: 10),
                Expanded(child: TextField(controller: price, keyboardType: TextInputType.number,
                    decoration: const InputDecoration(labelText: 'Price ₹'))),
              ]),
              const SizedBox(height: 10),
              Row(children: [
                Expanded(child: TextField(controller: taxRate, keyboardType: TextInputType.number,
                    decoration: const InputDecoration(labelText: 'GST %'))),
                const SizedBox(width: 10),
                Expanded(child: TextField(controller: discount, keyboardType: TextInputType.number,
                    decoration: const InputDecoration(labelText: 'Discount ₹ (optional)'))),
              ]),
              const SizedBox(height: 14),
              ElevatedButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('CREATE BILL')),
            ]),
          ),
        ),
      ),
    );
    if (saved != true || itemName.text.isEmpty || price.text.isEmpty || !mounted) return;
    try {
      await api.post('${app.basePath}/invoices', {
        'partyId': partyId,
        'items': [
          {
            'name': itemName.text.trim(),
            'qty': double.parse(qty.text.isEmpty ? '1' : qty.text),
            'price': double.parse(price.text),
            if (taxRate.text.isNotEmpty) 'taxRate': double.parse(taxRate.text),
          }
        ],
        if (discount.text.isNotEmpty) 'discount': double.parse(discount.text),
      });
      _load();
    } catch (e) {
      if (mounted) showSnack(context, e.toString(), error: true);
    }
  }

  Color _statusColor(String s) => switch (s) {
        'PAID' => AppColors.got,
        'PARTIAL' => Colors.orange,
        'CANCELLED' => Colors.grey,
        _ => AppColors.gave,
      };

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.surface,
      appBar: AppBar(title: const Text('Sales')),
      floatingActionButton: FloatingActionButton.extended(
        heroTag: 'add-bill',
        backgroundColor: AppColors.primary,
        onPressed: _createInvoice,
        icon: const Icon(Icons.add, color: Colors.white),
        label: const Text('NEW BILL', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800)),
      ),
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : Column(children: [
              Container(
                color: Colors.white,
                padding: const EdgeInsets.all(14),
                child: Row(children: [
                  Expanded(child: Column(children: [
                    const Text('Billed', style: TextStyle(color: Colors.black54, fontSize: 12)),
                    Text(inr(billed), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                  ])),
                  Expanded(child: Column(children: [
                    const Text('Collected', style: TextStyle(color: Colors.black54, fontSize: 12)),
                    Text(inr(collected),
                        style: const TextStyle(color: AppColors.got, fontWeight: FontWeight.w800, fontSize: 16)),
                  ])),
                  Expanded(child: Column(children: [
                    const Text('Due', style: TextStyle(color: Colors.black54, fontSize: 12)),
                    Text(inr(billed - collected),
                        style: const TextStyle(color: AppColors.gave, fontWeight: FontWeight.w800, fontSize: 16)),
                  ])),
                ]),
              ),
              const Divider(height: 1),
              Expanded(
                child: RefreshIndicator(
                  onRefresh: _load,
                  child: invoices.isEmpty
                      ? ListView(physics: const AlwaysScrollableScrollPhysics(), children: const [
                          Padding(
                            padding: EdgeInsets.only(top: 80),
                            child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                              Icon(Icons.receipt_long, size: 64, color: Colors.black12),
                              SizedBox(height: 8),
                              Text('No bills yet', style: TextStyle(fontWeight: FontWeight.w700), textAlign: TextAlign.center),
                              Text('Create GST-ready bills for your customers',
                                  style: TextStyle(color: Colors.black45, fontSize: 12), textAlign: TextAlign.center),
                            ]),
                          ),
                        ])
                      : ListView.separated(
                          padding: const EdgeInsets.only(bottom: 90),
                          itemCount: invoices.length,
                          separatorBuilder: (_, __) => const Divider(height: 1),
                          itemBuilder: (_, i) {
                            final inv = invoices[i];
                            return ListTile(
                              tileColor: Colors.white,
                              leading: InitialAvatar(inv.partyName),
                              title: Text('${inv.invoiceNo} · ${inv.partyName}',
                                  style: const TextStyle(fontWeight: FontWeight.w700)),
                              subtitle: Row(children: [
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                                  decoration: BoxDecoration(
                                    color: _statusColor(inv.status).withOpacity(0.12),
                                    borderRadius: BorderRadius.circular(4),
                                  ),
                                  child: Text(inv.status,
                                      style: TextStyle(fontSize: 10, color: _statusColor(inv.status),
                                          fontWeight: FontWeight.w800)),
                                ),
                                const SizedBox(width: 8),
                                Text(fmtDate(inv.issueDate), style: const TextStyle(fontSize: 12)),
                              ]),
                              trailing: Text(inr(inv.total),
                                  style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                              onTap: () async {
                                await Navigator.push(context,
                                    MaterialPageRoute(builder: (_) => InvoiceDetailScreen(invoiceId: inv.id)));
                                _load();
                              },
                            );
                          },
                        ),
                      ),
              ),
            ]),
    );
  }
}
