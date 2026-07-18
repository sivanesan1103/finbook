import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../core/api_client.dart';
import '../core/file_share.dart';
import '../core/formatters.dart';
import '../core/theme.dart';
import '../models/models.dart';
import '../providers/app_state.dart';
import '../widgets/common.dart';

class PartyReportScreen extends StatefulWidget {
  final Party party;
  const PartyReportScreen({super.key, required this.party});

  @override
  State<PartyReportScreen> createState() => _PartyReportScreenState();
}

class _PartyReportScreenState extends State<PartyReportScreen> {
  LedgerData? data;
  DateTime? from, to;
  String filter = 'ALL';
  final searchCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final app = context.read<AppState>();
    final params = <String>[];
    if (from != null) params.add('from=${from!.toIso8601String()}');
    if (to != null) params.add('to=${to!.toIso8601String()}');
    if (filter != 'ALL') params.add('type=$filter');
    if (searchCtrl.text.isNotEmpty) params.add('search=${Uri.encodeComponent(searchCtrl.text)}');
    final q = params.isEmpty ? '' : '?${params.join('&')}';
    final res = await ApiClient.instance
        .get('${app.basePath}/parties/${widget.party.id}/transactions$q');
    if (mounted) setState(() => data = LedgerData.fromJson(res['data']));
  }

  Future<void> _pickDate(bool start) async {
    final picked = await showDatePicker(
      context: context,
      initialDate: DateTime.now(),
      firstDate: DateTime(2020),
      lastDate: DateTime.now(),
    );
    if (picked != null) {
      setState(() => start ? from = picked : to = picked);
      _load();
    }
  }

  @override
  Widget build(BuildContext context) {
    final d = data;
    return Scaffold(
      backgroundColor: AppColors.surface,
      appBar: AppBar(title: Text('Report of ${widget.party.name}')),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(children: [
            Expanded(
              child: ElevatedButton.icon(
                onPressed: () => downloadAndShare(context,
                    path: '${context.read<AppState>().basePath}/parties/${widget.party.id}/statement.pdf',
                    filename: 'statement-${widget.party.name}.pdf',
                    subject: 'Statement — ${widget.party.name}'),
                icon: const Icon(Icons.picture_as_pdf_outlined),
                label: const Text('DOWNLOAD / SHARE PDF'),
              ),
            ),
          ]),
        ),
      ),
      body: Column(children: [
        // Filters header
        Container(
          color: AppColors.primary,
          padding: const EdgeInsets.all(14),
          child: Column(children: [
            Row(children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => _pickDate(true),
                  icon: const Icon(Icons.calendar_today, size: 16),
                  label: Text(from == null ? 'START DATE' : fmtDate(from!)),
                  style: OutlinedButton.styleFrom(
                      backgroundColor: Colors.white, foregroundColor: AppColors.primary),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => _pickDate(false),
                  icon: const Icon(Icons.calendar_today, size: 16),
                  label: Text(to == null ? 'END DATE' : fmtDate(to!)),
                  style: OutlinedButton.styleFrom(
                      backgroundColor: Colors.white, foregroundColor: AppColors.primary),
                ),
              ),
            ]),
            const SizedBox(height: 10),
            Row(children: [
              Expanded(
                child: TextField(
                  controller: searchCtrl,
                  onSubmitted: (_) => _load(),
                  decoration: const InputDecoration(
                      hintText: 'Search Entries', prefixIcon: Icon(Icons.search)),
                ),
              ),
              const SizedBox(width: 10),
              DropdownButton<String>(
                value: filter,
                dropdownColor: Colors.white,
                items: const [
                  DropdownMenuItem(value: 'ALL', child: Text('ALL')),
                  DropdownMenuItem(value: 'GAVE', child: Text('GAVE')),
                  DropdownMenuItem(value: 'GOT', child: Text('GOT')),
                ],
                onChanged: (v) { setState(() => filter = v!); _load(); },
              ),
            ]),
          ]),
        ),
        if (d == null)
          const Expanded(child: Center(child: CircularProgressIndicator()))
        else ...[
          ListTile(
            tileColor: Colors.white,
            title: const Text('Net Balance', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
            trailing: MoneyText(d.balance, size: 20),
          ),
          const Divider(height: 1),
          ListTile(
            tileColor: Colors.white,
            dense: true,
            title: Text('TOTAL\n${d.entries.length} Entries',
                style: const TextStyle(fontSize: 12, color: Colors.black54)),
            trailing: SizedBox(
              width: 200,
              child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                  const Text('YOU GAVE', style: TextStyle(fontSize: 10, color: Colors.black45)),
                  Text(inr(d.gave), style: const TextStyle(color: AppColors.gave, fontWeight: FontWeight.w800)),
                ]),
                Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                  const Text('YOU GOT', style: TextStyle(fontSize: 10, color: Colors.black45)),
                  Text(inr(d.got), style: const TextStyle(color: AppColors.got, fontWeight: FontWeight.w800)),
                ]),
              ]),
            ),
          ),
          const Divider(height: 1),
          Expanded(
            child: ListView.separated(
              itemCount: d.entries.length,
              separatorBuilder: (_, __) => const Divider(height: 1),
              itemBuilder: (_, i) {
                final e = d.entries[d.entries.length - 1 - i];
                final gave = e.type == 'GAVE';
                return ListTile(
                  tileColor: Colors.white,
                  title: Text(fmtDate(e.entryDate), style: const TextStyle(fontWeight: FontWeight.w600)),
                  subtitle: Container(
                    margin: const EdgeInsets.only(top: 4),
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                    decoration: BoxDecoration(
                        color: Colors.grey.shade100, borderRadius: BorderRadius.circular(4)),
                    child: Text('Bal. ${inr(e.runningBalance)}',
                        style: const TextStyle(fontSize: 11), overflow: TextOverflow.ellipsis),
                  ),
                  trailing: Text(inr(e.amount),
                      style: TextStyle(
                          color: gave ? AppColors.gave : AppColors.got,
                          fontWeight: FontWeight.w800, fontSize: 16)),
                );
              },
            ),
          ),
        ],
      ]),
    );
  }
}
