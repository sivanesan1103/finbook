import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../core/api_client.dart';
import '../core/formatters.dart';
import '../core/theme.dart';
import '../models/models.dart';
import '../providers/app_state.dart';
import '../widgets/common.dart';
import 'add_party_screen.dart';
import 'party_ledger_screen.dart';

class PartiesTab extends StatefulWidget {
  const PartiesTab({super.key});
  @override
  State<PartiesTab> createState() => _PartiesTabState();
}

class _PartiesTabState extends State<PartiesTab>
    with SingleTickerProviderStateMixin {
  late final TabController tabCtrl;
  final searchCtrl = TextEditingController();
  List<Party> parties = [];
  PartySummary summary = PartySummary();
  bool loading = true;

  String get type => tabCtrl.index == 0 ? 'CUSTOMER' : 'SUPPLIER';

  @override
  void initState() {
    super.initState();
    tabCtrl = TabController(length: 2, vsync: this);
    tabCtrl.addListener(() {
      if (!tabCtrl.indexIsChanging) _load();
    });
    _load();
  }

  Future<void> _load() async {
    final app = context.read<AppState>();
    if (app.business == null) return;
    setState(() => loading = true);
    try {
      final api = ApiClient.instance;
      final q = searchCtrl.text.isEmpty
          ? ''
          : '&search=${Uri.encodeComponent(searchCtrl.text)}';
      final list =
          await api.get('${app.basePath}/parties?type=$type&limit=100$q');
      final sum = await api.get('${app.basePath}/parties/summary?type=$type');
      if (!mounted) return;
      setState(() {
        parties = (list['data'] as List).map((p) => Party.fromJson(p)).toList();
        summary = PartySummary.fromJson(sum['data']);
        loading = false;
      });
    } catch (e) {
      if (mounted) {
        setState(() => loading = false);
        showSnack(context, e.toString(), error: true);
      }
    }
  }

  void _editBusinessName() {
    final app = context.read<AppState>();
    final ctrl = TextEditingController(text: app.business?.name);
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => Padding(
        padding: EdgeInsets.fromLTRB(
            20, 20, 20, MediaQuery.of(ctx).viewInsets.bottom + 20),
        child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Edit Business Name',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
              const SizedBox(height: 14),
              TextField(controller: ctrl, autofocus: true),
              const SizedBox(height: 14),
              ElevatedButton(
                onPressed: () async {
                  await app.renameBusiness(ctrl.text.trim());
                  if (ctx.mounted) Navigator.pop(ctx);
                },
                child: const Text('SAVE'),
              ),
              TextButton(
                onPressed: () {
                  Navigator.pop(ctx);
                  _createBook();
                },
                child: const Center(child: Text('Create New FinBook')),
              ),
              TextButton(
                onPressed: () {
                  Navigator.pop(ctx);
                  _chooseBook();
                },
                child: const Center(child: Text('Choose another book')),
              ),
            ]),
      ),
    );
  }

  void _createBook() {
    final ctrl = TextEditingController();
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Create New FinBook'),
        content: TextField(
            controller: ctrl,
            decoration: const InputDecoration(hintText: 'Business name')),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () async {
              await context.read<AppState>().createBusiness(ctrl.text.trim());
              if (ctx.mounted) Navigator.pop(ctx);
              _load();
            },
            child: const Text('Create'),
          ),
        ],
      ),
    );
  }

  void _chooseBook() {
    final app = context.read<AppState>();
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => ListView(
        shrinkWrap: true,
        padding: const EdgeInsets.symmetric(vertical: 16),
        children: [
          ...app.businesses.map((b) => ListTile(
                leading: InitialAvatar(b.name,
                    bg: AppColors.primary.withOpacity(0.1)),
                title: Text(b.name,
                    style: const TextStyle(fontWeight: FontWeight.w700)),
                subtitle: Text('${b.partyCount} parties'),
                trailing: b.id == app.business?.id
                    ? const Icon(Icons.check_circle, color: AppColors.primary)
                    : const Icon(Icons.radio_button_unchecked,
                        color: Colors.grey),
                onTap: () {
                  app.switchBusiness(b);
                  Navigator.pop(ctx);
                  _load();
                },
              )),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
            child: ElevatedButton.icon(
              onPressed: () {
                Navigator.pop(ctx);
                _createBook();
              },
              icon: const Icon(Icons.add),
              label: const Text('CREATE NEW KHATABOOK'),
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    final isCustomers = tabCtrl.index == 0;

    return Scaffold(
      backgroundColor: AppColors.surface,
      floatingActionButton: FloatingActionButton.extended(
        heroTag: 'add-party',
        backgroundColor:
            isCustomers ? AppColors.customerFab : AppColors.supplierFab,
        onPressed: () async {
          final added = await Navigator.push<bool>(
            context,
            MaterialPageRoute(
                builder: (_) => AddPartyScreen(initialType: type)),
          );
          if (added == true) _load();
        },
        icon: const Icon(Icons.person_add_alt_1, color: Colors.white),
        label: Text(isCustomers ? 'ADD CUSTOMER' : 'ADD SUPPLIER',
            style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w800,
                letterSpacing: 1)),
      ),
      body: Column(children: [
        // ── Blue header ──
        Container(
          color: AppColors.primary,
          padding: EdgeInsets.only(top: MediaQuery.of(context).padding.top),
          child: Column(children: [
            ListTile(
              leading: const Icon(Icons.menu_book_rounded,
                  color: Colors.white, size: 30),
              title: GestureDetector(
                onTap: _editBusinessName,
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  Flexible(
                    child: Text(app.business?.name ?? 'My Business',
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                            color: Colors.white,
                            fontSize: 20,
                            fontWeight: FontWeight.w800)),
                  ),
                  const SizedBox(width: 8),
                  const Icon(Icons.edit, color: Colors.white, size: 18),
                ]),
              ),
            ),
            TabBar(
              controller: tabCtrl,
              indicatorColor: AppColors.accentYellow,
              indicatorWeight: 4,
              labelColor: Colors.white,
              unselectedLabelColor: Colors.white60,
              labelStyle: const TextStyle(
                  fontWeight: FontWeight.w800, letterSpacing: 1),
              tabs: const [Tab(text: 'CUSTOMERS'), Tab(text: 'SUPPLIERS')],
            ),
            Padding(
              padding: const EdgeInsets.only(top: 10, bottom: 16),
              child: GiveGetCard(
                give: summary.youWillGive,
                get: summary.youWillGet,
                onReport: () => showSnack(context,
                    'Open a party and use Report to download their PDF statement.'),
              ),
            ),
          ]),
        ),

        // ── Search ──
        Padding(
          padding: const EdgeInsets.fromLTRB(14, 12, 14, 4),
          child: TextField(
            controller: searchCtrl,
            onSubmitted: (_) => _load(),
            decoration: InputDecoration(
              hintText: isCustomers ? 'Search Customer' : 'Search Supplier',
              prefixIcon: const Icon(Icons.search, color: AppColors.primary),
              suffixIcon: const Icon(Icons.filter_alt_outlined,
                  color: AppColors.primary),
              contentPadding: EdgeInsets.zero,
            ),
          ),
        ),

        // ── Party list ──
        Expanded(
          child: loading
              ? const Center(child: CircularProgressIndicator())
              : RefreshIndicator(
                  onRefresh: _load,
                  child: parties.isEmpty
                      ? ListView(
                          physics: const AlwaysScrollableScrollPhysics(),
                          children: [
                              Padding(
                                padding: const EdgeInsets.only(top: 80),
                                child: Column(
                                    mainAxisAlignment: MainAxisAlignment.center,
                                    children: [
                                      Icon(Icons.group_outlined,
                                          size: 72,
                                          color: Colors.grey.shade300),
                                      const SizedBox(height: 8),
                                      Text(
                                          'No ${isCustomers ? 'customers' : 'suppliers'} yet',
                                          style: const TextStyle(
                                              color: Colors.black54,
                                              fontWeight: FontWeight.w600),
                                          textAlign: TextAlign.center),
                                      const Text(
                                          'Tap the button below to add your first party',
                                          style: TextStyle(
                                              color: Colors.black38,
                                              fontSize: 12),
                                          textAlign: TextAlign.center),
                                    ]),
                              ),
                            ])
                      : ListView.separated(
                          padding: const EdgeInsets.only(bottom: 90),
                          itemCount: parties.length,
                          separatorBuilder: (_, __) => const Divider(height: 1),
                          itemBuilder: (_, i) {
                            final p = parties[i];
                            return ListTile(
                              tileColor: Colors.white,
                              leading: InitialAvatar(p.name),
                              title: Text(p.name,
                                  style: const TextStyle(
                                      fontWeight: FontWeight.w700)),
                              subtitle: Text(timeAgo(p.updatedAt),
                                  style: const TextStyle(
                                      fontSize: 12, color: Colors.black45)),
                              trailing: Column(
                                mainAxisAlignment: MainAxisAlignment.center,
                                crossAxisAlignment: CrossAxisAlignment.end,
                                children: [
                                  MoneyText(p.balance),
                                  Text(
                                    p.balance > 0
                                        ? '↙ REQUEST'
                                        : p.balance < 0
                                            ? 'ADVANCE'
                                            : 'SETTLED',
                                    style: TextStyle(
                                        fontSize: 10,
                                        fontWeight: FontWeight.w700,
                                        color: p.balance > 0
                                            ? AppColors.gave
                                            : Colors.black38),
                                  ),
                                ],
                              ),
                              onTap: () async {
                                await Navigator.push(
                                    context,
                                    MaterialPageRoute(
                                        builder: (_) =>
                                            PartyLedgerScreen(partyId: p.id)));
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
