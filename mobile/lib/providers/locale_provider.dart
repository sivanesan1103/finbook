import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// App language selection ('en' / 'ta'), persisted locally.
class LocaleProvider extends ChangeNotifier {
  String _code = 'en';
  String get code => _code;

  Future<void> load() async {
    final prefs = await SharedPreferences.getInstance();
    _code = prefs.getString('bk_lang') ?? 'en';
    notifyListeners();
  }

  Future<void> setLang(String code) async {
    _code = code;
    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('bk_lang', code);
  }
}
