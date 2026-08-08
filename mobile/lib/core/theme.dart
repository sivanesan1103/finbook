import 'package:flutter/material.dart';

/// Palette lifted from the reference mobile UI: deep khata blue, yellow tab
/// indicator, red "you gave" / green "you got", magenta customer FAB.
class AppColors {
  static const primary = Color(0xFF0D47A1);
  static const primaryDark = Color(0xFF0A3578);
  static const accentYellow = Color(0xFFF2B824);
  static const gave = Color(0xFFB71C1C); // red — you gave / will get
  static const got = Color(0xFF1B5E20); // green — you got / will give
  static const customerFab = Color(0xFFB0125A);
  static const supplierFab = Color(0xFF00796B);
  static const surface = Color(0xFFF4F6F8);
}

ThemeData buildTheme() {
  final base = ThemeData(
    useMaterial3: true,
    colorScheme: ColorScheme.fromSeed(
      seedColor: AppColors.primary,
      primary: AppColors.primary,
    ),
    scaffoldBackgroundColor: AppColors.surface,
  );
  return base.copyWith(
    appBarTheme: const AppBarTheme(
      backgroundColor: AppColors.primary,
      foregroundColor: Colors.white,
      elevation: 0,
      titleTextStyle: TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: Colors.white),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        minimumSize: const Size.fromHeight(52),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        textStyle: const TextStyle(fontWeight: FontWeight.w700, letterSpacing: 1),
      ),
    ),
    // Tamil nav labels are noticeably longer than English, so the default
    // NavigationBar label size made them wrap to two lines and clip
    // ("செலவுக / ள்"). A smaller label style plus a taller bar keeps every
    // label on one readable line across phone widths; labels stay always-on.
    navigationBarTheme: NavigationBarThemeData(
      height: 70,
      labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
      labelTextStyle: const WidgetStatePropertyAll(
        TextStyle(fontSize: 11, fontWeight: FontWeight.w600, height: 1.1),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colors.white,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: AppColors.primary),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide(color: Colors.blueGrey.shade100),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: AppColors.primary, width: 2),
      ),
    ),
  );
}
