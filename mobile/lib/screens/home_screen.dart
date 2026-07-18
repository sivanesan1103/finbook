import 'package:flutter/material.dart';
import '../core/theme.dart';
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
    return Scaffold(
      body: tabs[index],
      bottomNavigationBar: NavigationBar(
        selectedIndex: index,
        onDestinationSelected: (i) => setState(() => index = i),
        indicatorColor: AppColors.primary.withOpacity(0.12),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.groups_outlined), selectedIcon: Icon(Icons.groups), label: 'Parties'),
          NavigationDestination(icon: Icon(Icons.receipt_long_outlined), selectedIcon: Icon(Icons.receipt_long), label: 'Sales'),
          NavigationDestination(icon: Icon(Icons.menu_book_outlined), selectedIcon: Icon(Icons.menu_book), label: 'Cashbook'),
          NavigationDestination(icon: Icon(Icons.request_page_outlined), selectedIcon: Icon(Icons.request_page), label: 'Expenses'),
          NavigationDestination(icon: Icon(Icons.more_horiz), label: 'More'),
        ],
      ),
    );
  }
}
