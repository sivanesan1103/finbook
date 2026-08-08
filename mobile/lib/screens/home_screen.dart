import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../core/theme.dart';
import '../l10n/translations.dart';
import '../providers/locale_provider.dart';
import 'parties_tab.dart';
import 'bills_tab.dart';
import 'cashbook_screen.dart';
import 'expenses_tab.dart';
import 'more_tab.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});
  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int index = 0;

  // Rebuilt (not IndexedStack) on purpose: every tab's initState() reloads
  // its data, and that's the app's only refresh-on-return mechanism — an
  // IndexedStack would keep tabs mounted and silently go stale.
  static const tabs = [
    PartiesTab(), BillsTab(), CashbookScreen(), ExpensesTab(), MoreTab(),
  ];

  @override
  Widget build(BuildContext context) {
    context.watch<LocaleProvider>();
    return Scaffold(
      body: tabs[index],
      // Nav labels are fixed chrome: on a narrow phone or with a large system
      // font, the longer Tamil labels wrapped to two lines and clipped. Cap
      // the text scaling for the bar so every label stays on one line across
      // screen sizes and accessibility font settings (the rest of the app
      // still honours the user's font scale).
      bottomNavigationBar: MediaQuery.withClampedTextScaling(
        maxScaleFactor: 1.0,
        child: NavigationBar(
          selectedIndex: index,
          onDestinationSelected: (i) => setState(() => index = i),
          indicatorColor: AppColors.primary.withValues(alpha: 0.12),
          destinations: [
            NavigationDestination(icon: const Icon(Icons.groups_outlined), selectedIcon: const Icon(Icons.groups), label: context.tr('nav.parties')),
            NavigationDestination(icon: const Icon(Icons.receipt_long_outlined), selectedIcon: const Icon(Icons.receipt_long), label: context.tr('nav.sales')),
            NavigationDestination(icon: const Icon(Icons.menu_book_outlined), selectedIcon: const Icon(Icons.menu_book), label: context.tr('nav.cashbook')),
            NavigationDestination(icon: const Icon(Icons.request_page_outlined), selectedIcon: const Icon(Icons.request_page), label: context.tr('nav.expenses')),
            NavigationDestination(icon: const Icon(Icons.more_horiz), label: context.tr('nav.more')),
          ],
        ),
      ),
    );
  }
}
