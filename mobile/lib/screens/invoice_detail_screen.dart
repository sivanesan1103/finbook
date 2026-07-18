import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../core/api_client.dart';
import '../core/file_share.dart';
import '../core/formatters.dart';
import '../core/theme.dart';
import '../models/models.dart';
import '../providers/app_state.dart';
import '../widgets/common.dart';

const _kModes = ['CASH', 'ONLINE', 'UPI', 'BANK', 'CHEQUE'];

class InvoiceDetailScreen extends StatefulWidget {
  final String invoiceId;
  const InvoiceDetailScreen({super.key, required this.invoiceId});
  @override
  State<InvoiceDetailScreen> createState() => _InvoiceDetailScreenState();
}

class _InvoiceDetailScreenState extends State<InvoiceDetailScreen> {
  Invoice? invoice;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final app = context.read<AppState>();
    final res = await ApiClient.instance.get('${app.basePath}/invoices/${widget.invoiceId}');
    if (mounted) setState(() => invoice = Invoice.fromJson(res['data']));
  }

  Future<void> _collect() async {
    final inv = invoice!;
    final amount = TextEditingController(text: inv.due.toStringAsFixed(0));
    String mode = 'CASH';
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setD) => AlertDialog(
          title: Text('Collect payment — ${inv.invoiceNo}'),
          content: Column(mainAxisSize: MainAxisSize.min, children: [
            TextField(controller: amount, keyboardType: TextInputType.number,
                decoration: const InputDecoration(prefixText: '₹ ')),
            const SizedBox(height: 10),
            DropdownButtonFormField<String>(
              value: mode,
              decoration: const InputDecoration(labelText: 'Payment mode'),
              items: _kModes.map((m) => DropdownMenuItem(value: m, child: Text(m))).toList(),
              onChanged: (v) => setD(() => mode = v!),
            ),
          ]),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
            ElevatedButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Collect')),
          ],
        ),
      ),
    );
    if (ok != true || amount.text.isEmpty || !mounted) return;
    try {
      final app = context.read<AppState>();
      await ApiClient.instance.post('${app.basePath}/invoices/${inv.id}/payments',
          {'amount': double.parse(amount.text), 'mode': mode});
      _load();
    } catch (e) {
      if (mounted) showSnack(context, e.toString(), error: true);
    }
  }

  Future<void> _cancel() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Cancel invoice ${invoice!.invoiceNo}?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('No')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Yes, cancel')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    final app = context.read<AppState>();
    await ApiClient.instance.post('${app.basePath}/invoices/${invoice!.id}/cancel');
    _load();
  }

  Future<void> _delete() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Delete invoice ${invoice!.invoiceNo}?'),
        content: const Text('This cannot be undone.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Delete')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    final app = context.read<AppState>();
    await ApiClient.instance.delete('${app.basePath}/invoices/${invoice!.id}');
    if (mounted) Navigator.pop(context);
  }

  Color _statusColor(String s) => switch (s) {
        'PAID' => AppColors.got,
        'PARTIAL' => Colors.orange,
        'CANCELLED' => Colors.grey,
        _ => AppColors.gave,
      };

  @override
  Widget build(BuildContext context) {
    final inv = invoice;
    return Scaffold(
      backgroundColor: AppColors.surface,
      appBar: AppBar(
        title: Text(inv?.invoiceNo ?? 'Invoice'),
        actions: [
          IconButton(
            icon: const Icon(Icons.delete_outline),
            onPressed: inv == null ? null : _delete,
          ),
        ],
      ),
      bottomNavigationBar: inv == null
          ? null
          : SafeArea(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Row(children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () => downloadAndShare(context,
                          path: '${context.read<AppState>().basePath}/invoices/${inv.id}/pdf',
                          filename: 'invoice-${inv.invoiceNo}.pdf', subject: 'Invoice ${inv.invoiceNo}'),
                      icon: const Icon(Icons.picture_as_pdf_outlined),
                      label: const Text('PDF'),
                      style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(50)),
                    ),
                  ),
                  if (inv.due > 0 && inv.status != 'CANCELLED') ...[
                    const SizedBox(width: 12),
                    Expanded(
                      flex: 2,
                      child: ElevatedButton(
                        style: ElevatedButton.styleFrom(backgroundColor: AppColors.got),
                        onPressed: _collect,
                        child: const Text('COLLECT PAYMENT'),
                      ),
                    ),
                  ],
                ]),
              ),
            ),
      body: inv == null
          ? const Center(child: CircularProgressIndicator())
          : ListView(children: [
              Container(
                color: Colors.white,
                padding: const EdgeInsets.all(16),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                          color: _statusColor(inv.status).withOpacity(0.12), borderRadius: BorderRadius.circular(6)),
                      child: Text(inv.status,
                          style: TextStyle(color: _statusColor(inv.status), fontWeight: FontWeight.w800, fontSize: 12)),
                    ),
                    const Spacer(),
                    Text(fmtDate(inv.issueDate), style: const TextStyle(color: Colors.black54)),
                  ]),
                  const SizedBox(height: 8),
                  Text(inv.partyName, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
                  if (inv.partyPhone != null) Text(inv.partyPhone!, style: const TextStyle(color: Colors.black54)),
                  if (inv.dueDate != null) Text('Due date: ${fmtDate(inv.dueDate!)}', style: const TextStyle(color: Colors.black54, fontSize: 12)),
                ]),
              ),
              const SizedBox(height: 10),
              Container(
                color: Colors.white,
                child: Column(children: [
                  const Padding(
                    padding: EdgeInsets.fromLTRB(16, 12, 16, 4),
                    child: Align(alignment: Alignment.centerLeft,
                        child: Text('ITEMS', style: TextStyle(fontWeight: FontWeight.w800, color: Colors.black54, fontSize: 12))),
                  ),
                  ...inv.items.map((it) => ListTile(
                        dense: true,
                        title: Text(it.name, style: const TextStyle(fontWeight: FontWeight.w600)),
                        subtitle: Text('${it.qty} × ${inr(it.price)}${it.taxRate > 0 ? ' · GST ${it.taxRate}%' : ''}'),
                        trailing: Text(inr(it.amount), style: const TextStyle(fontWeight: FontWeight.w700)),
                      )),
                  const Divider(height: 1),
                  ListTile(dense: true, title: const Text('Subtotal'), trailing: Text(inr(inv.subtotal))),
                  ListTile(dense: true, title: const Text('Tax'), trailing: Text(inr(inv.taxAmount))),
                  if (inv.discount > 0)
                    ListTile(dense: true, title: const Text('Discount'),
                        trailing: Text('− ${inr(inv.discount)}', style: const TextStyle(color: AppColors.got))),
                  const Divider(height: 1),
                  ListTile(
                    title: const Text('Grand Total', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                    trailing: Text(inr(inv.total), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
                  ),
                  ListTile(dense: true, title: const Text('Paid'),
                      trailing: Text(inr(inv.amountPaid), style: const TextStyle(color: AppColors.got, fontWeight: FontWeight.w700))),
                  if (inv.due > 0 && inv.status != 'CANCELLED')
                    ListTile(dense: true, title: const Text('Balance Due'),
                        trailing: Text(inr(inv.due), style: const TextStyle(color: AppColors.gave, fontWeight: FontWeight.w700))),
                ]),
              ),
              if (inv.payments.isNotEmpty) ...[
                const SizedBox(height: 10),
                Container(
                  color: Colors.white,
                  child: Column(children: [
                    const Padding(
                      padding: EdgeInsets.fromLTRB(16, 12, 16, 4),
                      child: Align(alignment: Alignment.centerLeft,
                          child: Text('PAYMENTS', style: TextStyle(fontWeight: FontWeight.w800, color: Colors.black54, fontSize: 12))),
                    ),
                    ...inv.payments.map((p) => ListTile(
                          dense: true,
                          title: Text('${fmtDate(p.paidAt)} · ${p.mode}'),
                          trailing: Text(inr(p.amount), style: const TextStyle(color: AppColors.got, fontWeight: FontWeight.w700)),
                        )),
                  ]),
                ),
              ],
              if (inv.status != 'CANCELLED' && inv.status != 'PAID')
                Padding(
                  padding: const EdgeInsets.all(16),
                  child: OutlinedButton(onPressed: _cancel, child: const Text('CANCEL INVOICE')),
                ),
              const SizedBox(height: 24),
            ]),
    );
  }
}
