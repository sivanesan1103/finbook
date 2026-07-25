import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'core/crash_reporter.dart';
import 'core/theme.dart';
import 'providers/app_state.dart';
import 'providers/locale_provider.dart';
import 'screens/login_screen.dart';
import 'screens/home_screen.dart';

void main() {
  installCrashReporting();
  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => AppState()..boot()),
        ChangeNotifierProvider(create: (_) => LocaleProvider()..load()),
      ],
      child: const FinBookApp(),
    ),
  );
}

class FinBookApp extends StatelessWidget {
  const FinBookApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'FinBook',
      debugShowCheckedModeBanner: false,
      theme: buildTheme(),
      home: Consumer<AppState>(
        builder: (context, app, _) {
          if (app.booting) {
            return const Scaffold(
              backgroundColor: AppColors.primary,
              body: Center(
                child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                  Icon(Icons.menu_book_rounded, color: Colors.white, size: 72),
                  SizedBox(height: 12),
                  Text('FinBook',
                      style: TextStyle(color: Colors.white, fontSize: 28, fontWeight: FontWeight.w800)),
                  SizedBox(height: 24),
                  CircularProgressIndicator(color: Colors.white),
                ]),
              ),
            );
          }
          // Keyed by language so switching it tears down and rebuilds every
          // screen fresh — `context.tr()` reads the locale with `listen:
          // false` (safe to call from callbacks), so without this key most
          // already-built screens would keep showing the old language until
          // they happened to rebuild for some other reason.
          return Consumer<LocaleProvider>(
            builder: (context, locale, _) => KeyedSubtree(
              key: ValueKey(locale.code),
              child: app.user == null ? const LoginScreen() : const HomeScreen(),
            ),
          );
        },
      ),
    );
  }
}
