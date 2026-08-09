import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../core/api_client.dart';
import '../core/formatters.dart';
import '../core/theme.dart';
import '../l10n/translations.dart';
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
  // The cashbook API is gated server-side by the `cashbook` staff permission
  // (cashbook.routes.js requirePermission('cashbook')) — a staff member
  // without it gets a 403 on every call here. Surface that as a clear locked
  // state (matching the web app) instead of leaving an empty list with the
  // IN/OUT buttons still active, which just fails again on every tap.
  bool forbidden = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { loading = true; forbidden = false; });
    final app = context.read<AppState>();
    final api = ApiClient.instance;
    final d = date.toIso8601String().substring(0, 10);
    try {
      // Page through every entry for the selected day/mode — the backend
      // hard-clamps limit to 100 (backend/src/utils/pagination.js), so a
      // single-page fetch would silently undercount the IN/OUT totals below
      // once a day has more than 100 entries. Capped at 50 pages (5,000
      // entries/day) as a sanity bound, same as the web fix for this.
      final all = <CashEntry>[];
      var page = 1;
      while (true) {
        final list = await api
            .get('${app.basePath}/cashbook?date=$d&paymentMode=$mode&limit=100&page=$page');
        all.addAll((list['data'] as List).map((e) => CashEntry.fromJson(e)));
        final pages = (list['meta']?['pages'] as num?)?.toInt() ?? 1;
        if (page >= pages || page >= 50) break;
        page++;
      }
      final sum = await api.get('${app.basePath}/cashbook/summary');
      if (!mounted) return;
      setState(() {
        entries = all;
        totalBalance = (sum['data']['totalBalance'] as num).toDouble();
        todayBalance = (sum['data']['todayBalance'] as num).toDouble();
      });
    } catch (e) {
      if (!mounted) return;
      if (e is ApiException && e.status == 403) {
        setState(() => forbidden = true);
      } else {
        showSnack(context, e.toString(), error: true);
      }
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> _add(String direction, {CashEntry? editing}) async {
    final amount = TextEditingController(text: editing != null ? _trimNum(editing.amount) : '');
    final desc = TextEditingController(text: editing?.description ?? '');
    String payMode = editing?.paymentMode ?? 'CASH';
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => Padding(
        // viewPadding.bottom clears the system nav bar (3-button nav) — without
        // it the Save button renders under the nav bar and isn't tappable.
        padding: EdgeInsets.fromLTRB(20, 20, 20,
            MediaQuery.of(ctx).viewInsets.bottom + MediaQuery.of(ctx).viewPadding.bottom + 20),
        child: StatefulBuilder(
          builder: (ctx, setSheet) => Column(mainAxisSize: MainAxisSize.min, children: [
            Text(
              editing != null
                  ? '${context.tr('cashbookScreen.editPrefix')}${direction == 'IN' ? context.tr('cashbookScreen.cashIn') : context.tr('cashbookScreen.cashOut')}'
                  : (direction == 'IN' ? context.tr('cashbookScreen.cashIn') : context.tr('cashbookScreen.cashOut')),
              style: TextStyle(
                  fontSize: 18, fontWeight: FontWeight.w800,
                  color: direction == 'IN' ? AppColors.got : AppColors.gave),
            ),
            const SizedBox(height: 14),
            TextField(controller: amount, autofocus: true,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                decoration: InputDecoration(labelText: context.tr('cashbookScreen.amount'), prefixText: '₹ ')),
            const SizedBox(height: 10),
            TextField(controller: desc, decoration: InputDecoration(labelText: context.tr('cashbookScreen.description'))),
            const SizedBox(height: 10),
            DropdownButtonFormField<String>(
              value: payMode,
              decoration: InputDecoration(labelText: context.tr('cashbookScreen.paymentMode')),
              items: ['CASH', 'ONLINE', 'UPI', 'BANK', 'CHEQUE']
                  .map((m) => DropdownMenuItem(value: m, child: Text(context.tr(modeLabelKeys[m]!)))).toList(),
              onChanged: (v) => setSheet(() => payMode = v!),
            ),
            const SizedBox(height: 14),
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                  backgroundColor: direction == 'IN' ? AppColors.got : AppColors.gave),
              onPressed: () => Navigator.pop(ctx, true),
              child: Text(editing != null ? context.tr('cashbookScreen.saveChanges') : context.tr('cashbookScreen.save')),
            ),
          ]),
        ),
      ),
    );
    if (saved != true || amount.text.isEmpty || !mounted) return;
    try {
      final app = context.read<AppState>();
      final payload = {
        'direction': direction,
        'amount': double.parse(amount.text),
        if (desc.text.trim().isNotEmpty) 'description': desc.text.trim(),
        'paymentMode': payMode,
        // When editing, keep the entry's original timestamp — the sheet has
        // no date/time field of its own, so falling back to the browsed
        // `date` here would silently overwrite the entry's real time (or
        // even its day) with whatever's currently being viewed. Only new
        // entries should take the browsed date.
        // .toUtc() first — a bare local-time string like "2026-07-26T22:47"
        // has no offset, so the backend (running in UTC) parses it as if it
        // were already UTC, silently shifting every entry by the device's
        // UTC offset (5.5h for IST) instead of the instant actually meant.
        'entryDate': (editing?.entryDate ?? date).toUtc().toIso8601String(),
      };
      if (editing != null) {
        await ApiClient.instance.patch('${app.basePath}/cashbook/${editing.id}', payload);
      } else {
        await ApiClient.instance.post('${app.basePath}/cashbook', payload);
      }
      // The list is filtered by payment mode — without this, saving a CASH
      // entry while viewing e.g. the UPI filter creates it successfully but
      // it never appears, which just looks like "adding did nothing".
      if (mode != 'ALL' && mode != payMode) {
        setState(() => mode = 'ALL');
      }
      _load();
    } catch (e) {
      if (mounted) showSnack(context, e.toString(), error: true);
    }
  }

  static String _trimNum(double n) => n == n.roundToDouble() ? n.toInt().toString() : n.toString();

  Future<void> _delete(CashEntry e) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(context.tr('cashbookScreen.confirmDeleteEntry')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(context.tr('itemsTab.cancel'))),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: Text(context.tr('cashbookScreen.delete'))),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    try {
      final app = context.read<AppState>();
      await ApiClient.instance.delete('${app.basePath}/cashbook/${e.id}');
      if (mounted) showSnack(context, context.tr('cashbookScreen.entryDeleted'));
      _load();
    } catch (err) {
      if (mounted) showSnack(context, err.toString(), error: true);
    }
  }

  void _showDetail(CashEntry e) {
    final isIn = e.direction == 'IN';
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 28),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            CircleAvatar(
              backgroundColor: isIn ? const Color(0xFFEFF7F0) : const Color(0xFFFBE9EA),
              child: Icon(isIn ? Icons.south_west : Icons.north_east, color: isIn ? AppColors.got : AppColors.gave),
            ),
            const SizedBox(width: 12),
            Expanded(child: Text(e.description ?? context.tr('cashbookScreen.noDescription'),
                style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16))),
            Text(inr(e.amount), style: TextStyle(color: isIn ? AppColors.got : AppColors.gave, fontWeight: FontWeight.w800, fontSize: 18)),
          ]),
          const SizedBox(height: 6),
          Text(context.tr('cashbookScreen.entryLine', {'mode': context.tr(modeLabelKeys[e.paymentMode] ?? e.paymentMode), 'date': fmtDateTime(e.entryDate)}),
              style: const TextStyle(color: Colors.black54, fontSize: 12)),
          const SizedBox(height: 18),
          if (e.isMirrored)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(color: Colors.black.withOpacity(0.04), borderRadius: BorderRadius.circular(8)),
              child: Text(
                e.expenseId != null ? context.tr('cashbookScreen.linkedToExpense') : context.tr('cashbookScreen.linkedToLedger'),
                style: const TextStyle(color: Colors.black54, fontSize: 12),
              ),
            )
          else
            Row(children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: () { Navigator.pop(ctx); _add(e.direction, editing: e); },
                  child: Text(context.tr('cashbookScreen.edit')),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: OutlinedButton(
                  style: OutlinedButton.styleFrom(foregroundColor: AppColors.gave),
                  onPressed: () { Navigator.pop(ctx); _delete(e); },
                  child: Text(context.tr('cashbookScreen.delete')),
                ),
              ),
            ]),
        ]),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (forbidden) {
      return Scaffold(
        backgroundColor: AppColors.surface,
        appBar: AppBar(title: Text(context.tr('cashbookScreen.title'))),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
              const Icon(Icons.lock_outline, size: 64, color: Colors.black12),
              const SizedBox(height: 8),
              Text(context.tr('common.noAccessTitle'),
                  textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.w700)),
              const SizedBox(height: 4),
              Text(context.tr('common.noAccessSubtitle'),
                  textAlign: TextAlign.center, style: const TextStyle(color: Colors.black45, fontSize: 12)),
            ]),
          ),
        ),
      );
    }

    final dayIn = entries.where((e) => e.direction == 'IN').fold(0.0, (s, e) => s + e.amount);
    final dayOut = entries.where((e) => e.direction == 'OUT').fold(0.0, (s, e) => s + e.amount);

    return Scaffold(
      backgroundColor: AppColors.surface,
      appBar: AppBar(title: Text(context.tr('cashbookScreen.title'))),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(children: [
            Expanded(
              child: ElevatedButton(
                style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFFFBE9EA), foregroundColor: AppColors.gave),
                onPressed: () => _add('OUT'),
                child: Text(context.tr('cashbookScreen.out')),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: ElevatedButton(
                style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFFEFF7F0), foregroundColor: AppColors.got),
                onPressed: () => _add('IN'),
                child: Text(context.tr('cashbookScreen.in')),
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
              Text(context.tr('cashbookScreen.totalBalance'), maxLines: 2, style: const TextStyle(color: Colors.black54, fontSize: 12)),
              FittedBox(fit: BoxFit.scaleDown, alignment: Alignment.centerLeft,
                  child: Text(inr(totalBalance), style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800))),
            ])),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(context.tr('cashbookScreen.todaysBalance'), maxLines: 2, style: const TextStyle(color: Colors.black54, fontSize: 12)),
              FittedBox(fit: BoxFit.scaleDown, alignment: Alignment.centerLeft,
                  child: Text(inr(todayBalance), style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800))),
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
              items: ['ALL', 'CASH', 'ONLINE', 'UPI', 'BANK', 'CHEQUE']
                  .map((m) => DropdownMenuItem(value: m, child: Text(m == 'ALL' ? context.tr('cashbookScreen.all') : context.tr(modeLabelKeys[m]!)))).toList(),
              onChanged: (v) { setState(() => mode = v!); _load(); },
            ),
          ]),
        ),
        ListTile(
          dense: true,
          title: Text(context.tr('cashbookScreen.entriesLine', {'date': fmtDate(date), 'count': entries.length}),
              style: const TextStyle(fontWeight: FontWeight.w700)),
          // A fixed-width box here overflowed once OUT/IN totals grew past a
          // few digits (large cash flows are entirely plausible for a real
          // business) — size to content instead so it can never clip.
          trailing: Row(mainAxisSize: MainAxisSize.min, children: [
            Text(context.tr('cashbookScreen.outAmount', {'amount': inr(dayOut)}), style: const TextStyle(color: AppColors.gave, fontSize: 12, fontWeight: FontWeight.w700)),
            const SizedBox(width: 12),
            Text(context.tr('cashbookScreen.inAmount', {'amount': inr(dayIn)}), style: const TextStyle(color: AppColors.got, fontSize: 12, fontWeight: FontWeight.w700)),
          ]),
        ),
        Expanded(
          child: loading
              ? const Center(child: CircularProgressIndicator())
              : RefreshIndicator(
                  onRefresh: _load,
                  child: entries.isEmpty
                      ? ListView(physics: const AlwaysScrollableScrollPhysics(), children: [
                          Padding(
                            padding: const EdgeInsets.only(top: 80),
                            child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                              const Icon(Icons.menu_book, size: 64, color: Colors.black12),
                              const SizedBox(height: 8),
                              Text(context.tr('cashbookScreen.addFirstTransaction'), style: const TextStyle(fontWeight: FontWeight.w700), textAlign: TextAlign.center),
                              Text(context.tr('cashbookScreen.emptySubtitle'), style: const TextStyle(color: Colors.black45, fontSize: 12), textAlign: TextAlign.center),
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
                              title: Text(e.description ?? context.tr('cashbookScreen.noDescription')),
                              subtitle: Text(context.tr('cashbookScreen.entryLine', {'mode': context.tr(modeLabelKeys[e.paymentMode] ?? e.paymentMode), 'date': fmtDateTime(e.entryDate)}),
                                  style: const TextStyle(fontSize: 12)),
                              trailing: Text(inr(e.amount),
                                  style: TextStyle(
                                      color: isIn ? AppColors.got : AppColors.gave,
                                      fontWeight: FontWeight.w800, fontSize: 16)),
                              onTap: () => _showDetail(e),
                            );
                          },
                        ),
                ),
        ),
      ]),
    );
  }
}
