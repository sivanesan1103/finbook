import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../core/api_client.dart';
import '../core/formatters.dart';
import '../core/theme.dart';
import '../models/models.dart';
import '../providers/app_state.dart';
import '../widgets/common.dart';
import 'add_entry_screen.dart';
import 'entry_details_screen.dart';
import 'party_profile_screen.dart';
import 'party_report_screen.dart';

class PartyLedgerScreen extends StatefulWidget {
  final String partyId;
  const PartyLedgerScreen({super.key, required this.partyId});

  @override
  State<PartyLedgerScreen> createState() => _PartyLedgerScreenState();
}

class _PartyLedgerScreenState extends State<PartyLedgerScreen> {
  LedgerData? ledger;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final app = context.read<AppState>();
    final res = await ApiClient.instance
        .get('${app.basePath}/parties/${widget.partyId}/transactions');
    if (mounted) setState(() => ledger = LedgerData.fromJson(res['data']));
  }

  Future<void> _addEntry(String type) async {
    final saved = await Navigator.push<bool>(
      context,
      MaterialPageRoute(builder: (_) => AddEntryScreen(party: ledger!.party, type: type)),
    );
    if (saved == true) _load();
  }

  @override
  Widget build(BuildContext context) {
    final l = ledger;
    final party = l?.party;

    return Scaffold(
      backgroundColor: AppColors.surface,
      appBar: AppBar(
        titleSpacing: 0,
        title: party == null
            ? const Text('Khata')
            : InkWell(
                onTap: () async {
                  await Navigator.push(context,
                      MaterialPageRoute(builder: (_) => PartyProfileScreen(party: party)));
                  if (mounted) {
                    // Party may have been deleted from the profile screen.
                    try { await _load(); } catch (_) { if (mounted) Navigator.pop(context); }
                  }
                },
                child: Row(children: [
                  InitialAvatar(party.name, radius: 18, bg: Colors.white),
                  const SizedBox(width: 10),
                  Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Row(children: [
                      Text(party.name, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
                      const SizedBox(width: 6),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                        decoration: BoxDecoration(
                            color: Colors.white24, borderRadius: BorderRadius.circular(4)),
                        child: Text(party.type == 'CUSTOMER' ? 'Customer' : 'Supplier',
                            style: const TextStyle(fontSize: 11)),
                      ),
                    ]),
                    const Text('View settings', style: TextStyle(fontSize: 12, color: Colors.white70)),
                  ]),
                ]),
              ),
        actions: [
          IconButton(icon: const Icon(Icons.call), onPressed: () {
            showSnack(context, party?.phone == null || party!.phone!.isEmpty
                ? 'No phone number saved' : 'Call ${party.phone}');
          }),
        ],
      ),
      body: l == null
          ? const Center(child: CircularProgressIndicator())
          : Column(children: [
              // Balance header
              Container(
                color: AppColors.primary,
                padding: const EdgeInsets.fromLTRB(14, 4, 14, 16),
                child: Card(
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          l.balance > 0 ? 'You will get' : l.balance < 0 ? 'You will give' : 'Settled up',
                          style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600),
                        ),
                        MoneyText(l.balance, size: 20),
                      ],
                    ),
                  ),
                ),
              ),
              // Report row
              Container(
                color: Colors.white,
                width: double.infinity,
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: InkWell(
                  onTap: () => Navigator.push(context,
                      MaterialPageRoute(builder: (_) => PartyReportScreen(party: l.party))),
                  child: const Column(children: [
                    Icon(Icons.picture_as_pdf_outlined, color: AppColors.primary),
                    Text('Report', style: TextStyle(color: AppColors.primary, fontWeight: FontWeight.w700)),
                  ]),
                ),
              ),
              const Divider(height: 1),
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Row(children: [
                  const SizedBox(width: 16),
                  const Icon(Icons.verified_user, color: Colors.green, size: 16),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text('Only you and ${l.party.name} can see these entries',
                        style: const TextStyle(color: Colors.black54, fontSize: 12)),
                  ),
                ]),
              ),
              // Entries
              Expanded(
                child: l.entries.isEmpty
                    ? Center(
                        child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                          Text('Start adding transactions with ${l.party.name}',
                              style: const TextStyle(fontWeight: FontWeight.w600, color: Colors.black54)),
                          const SizedBox(height: 8),
                          const Icon(Icons.arrow_downward, color: AppColors.primary, size: 28),
                        ]),
                      )
                    : ListView.builder(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                        itemCount: l.entries.length,
                        itemBuilder: (_, i) {
                          final e = l.entries[l.entries.length - 1 - i]; // newest first
                          final gave = e.type == 'GAVE';
                          return Card(
                            margin: const EdgeInsets.symmetric(vertical: 4),
                            child: InkWell(
                              onTap: () async {
                                final changed = await Navigator.push<bool>(
                                  context,
                                  MaterialPageRoute(
                                      builder: (_) => EntryDetailsScreen(party: l.party, entry: e)),
                                );
                                if (changed == true) _load();
                              },
                              child: Padding(
                                padding: const EdgeInsets.all(12),
                                child: Row(children: [
                                  Expanded(
                                    flex: 3,
                                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                      Text(fmtDateTime(e.entryDate),
                                          style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                                      const SizedBox(height: 4),
                                      Container(
                                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                        decoration: BoxDecoration(
                                          color: const Color(0xFFFBE9EA),
                                          borderRadius: BorderRadius.circular(4),
                                        ),
                                        child: Text('Bal. ${inr(e.runningBalance)}',
                                            style: const TextStyle(fontSize: 11, color: AppColors.gave)),
                                      ),
                                      if (e.description != null && e.description!.isNotEmpty)
                                        Padding(
                                          padding: const EdgeInsets.only(top: 4),
                                          child: Text(e.description!,
                                              style: const TextStyle(fontSize: 12, color: Colors.black54)),
                                        ),
                                    ]),
                                  ),
                                  Expanded(
                                    flex: 2,
                                    child: Container(
                                      alignment: Alignment.center,
                                      padding: const EdgeInsets.symmetric(vertical: 10),
                                      color: gave ? const Color(0xFFFDF3F4) : Colors.transparent,
                                      child: gave
                                          ? Text(inr(e.amount),
                                              style: const TextStyle(
                                                  color: AppColors.gave, fontWeight: FontWeight.w800, fontSize: 16))
                                          : null,
                                    ),
                                  ),
                                  Expanded(
                                    flex: 2,
                                    child: Container(
                                      alignment: Alignment.center,
                                      padding: const EdgeInsets.symmetric(vertical: 10),
                                      color: !gave ? const Color(0xFFEFF7F0) : Colors.transparent,
                                      child: !gave
                                          ? Text(inr(e.amount),
                                              style: const TextStyle(
                                                  color: AppColors.got, fontWeight: FontWeight.w800, fontSize: 16))
                                          : null,
                                    ),
                                  ),
                                ]),
                              ),
                            ),
                          );
                        },
                      ),
              ),
              // Bottom actions
              SafeArea(
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Row(children: [
                    Expanded(
                      child: ElevatedButton(
                        style: ElevatedButton.styleFrom(backgroundColor: AppColors.gave),
                        onPressed: () => _addEntry('GAVE'),
                        child: const Text('YOU GAVE ₹'),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: ElevatedButton(
                        style: ElevatedButton.styleFrom(backgroundColor: AppColors.got),
                        onPressed: () => _addEntry('GOT'),
                        child: const Text('YOU GOT ₹'),
                      ),
                    ),
                  ]),
                ),
              ),
            ]),
    );
  }
}
