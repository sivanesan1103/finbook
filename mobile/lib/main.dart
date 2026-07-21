import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'core/theme.dart';
import 'providers/app_state.dart';
import 'providers/locale_provider.dart';
import 'screens/login_screen.dart';
import 'screens/home_screen.dart';

void main() {
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
          return app.user == null ? const LoginScreen() : const HomeScreen();
        },
      ),
    );
  }
}
